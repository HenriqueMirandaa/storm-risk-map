import type { Config } from './config.js';
import { REGIONS, REGION_IDS } from './data/regions.js';
import { computeRisk } from './risk/score.js';
import type { SnapshotStore } from './store.js';
import type { DataProvider, SourceStatus, Warning, WeatherPoint } from './types.js';

type SourceName = 'ipma' | 'weather';

interface SourceState {
  lastSuccessMs: number | null;
  lastError: string | null;
  failures: number;
}

/**
 * Faz polling das fontes com backoff em falhas, mantem o ultimo dado bom (stale-while-error)
 * e recalcula + publica o snapshot sempre que algo muda.
 */
export class Scheduler {
  private warnings: Warning[] = [];
  private weather = new Map<string, WeatherPoint>();
  private timers = new Set<NodeJS.Timeout>();
  private stopped = false;
  private warnedUnmapped = false;
  private readonly state: Record<SourceName, SourceState> = {
    ipma: { lastSuccessMs: null, lastError: null, failures: 0 },
    weather: { lastSuccessMs: null, lastError: null, failures: 0 },
  };

  constructor(
    private readonly provider: DataProvider,
    private readonly store: SnapshotStore,
    private readonly cfg: Config,
  ) {}

  start(): void {
    this.loop('ipma', this.cfg.ipmaPollMs, async () => {
      this.warnings = await this.provider.warnings();
      this.logUnmappedOnce();
    });
    this.loop('weather', this.cfg.weatherPollMs, async () => {
      const points = await this.provider.weather(REGIONS);
      this.weather = new Map(points.map((p) => [p.regionId, p]));
    });
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private loop(name: SourceName, intervalMs: number, job: () => Promise<void>): void {
    const run = async (): Promise<void> => {
      if (this.stopped) return;
      const s = this.state[name];
      let delay = intervalMs;
      try {
        await job();
        s.lastSuccessMs = Date.now();
        s.lastError = null;
        s.failures = 0;
      } catch (err) {
        s.failures += 1;
        s.lastError = err instanceof Error ? err.message : String(err);
        console.error(`[${name}] falhou (${s.failures}x): ${s.lastError}`);
        delay = Math.min(intervalMs, 30_000 * 2 ** (s.failures - 1)); // retry mais cedo que o intervalo normal
      }
      this.publish();
      if (this.stopped) return;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        void run();
      }, delay);
      this.timers.add(timer);
    };
    void run();
  }

  private statusOf(name: SourceName, intervalMs: number): SourceStatus {
    const s = this.state[name];
    const lastSuccess = s.lastSuccessMs ? new Date(s.lastSuccessMs).toISOString() : null;
    let state: SourceStatus['state'];
    if (s.lastSuccessMs === null) state = s.lastError ? 'error' : 'pending';
    else if (s.lastError) state = Date.now() - s.lastSuccessMs > 3 * intervalMs ? 'stale' : 'ok';
    else state = 'ok';
    return { state, lastSuccess, lastError: s.lastError };
  }

  private publish(): void {
    const byRegion = new Map<string, Warning[]>();
    for (const w of this.warnings) {
      const list = byRegion.get(w.areaId) ?? [];
      list.push(w);
      byRegion.set(w.areaId, list);
    }
    const regions = REGIONS.map((r) =>
      computeRisk(r, byRegion.get(r.id) ?? [], this.weather.get(r.id)),
    ).sort((a, b) => b.score - a.score);

    this.store.set({
      generatedAt: new Date().toISOString(),
      mode: this.cfg.mode,
      stormName: this.cfg.mode === 'mock' ? (this.cfg.stormName ?? 'Charles (simulação)') : this.cfg.stormName,
      sources: {
        ipma: this.statusOf('ipma', this.cfg.ipmaPollMs),
        weather: this.statusOf('weather', this.cfg.weatherPollMs),
      },
      regions,
    });
  }

  private logUnmappedOnce(): void {
    if (this.warnedUnmapped) return;
    const unmapped = new Set(this.warnings.map((w) => w.areaId).filter((id) => !REGION_IDS.has(id)));
    if (unmapped.size > 0) {
      this.warnedUnmapped = true;
      console.warn(
        `[ipma] avisos de areas nao mapeadas (ignorados): ${[...unmapped].join(', ')}. ` +
          'Se forem distritos do continente, corrigir os codigos em src/data/regions.ts.',
      );
    }
  }
}
