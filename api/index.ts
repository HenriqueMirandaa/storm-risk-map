import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from '../src/config.js';
import { REGIONS } from '../src/data/regions.js';
import { LiveProvider } from '../src/providers/live.js';
import { computeRisk } from '../src/risk/score.js';
import type { Snapshot, SourceStatus, Warning, WeatherPoint } from '../src/types.js';

const cfg = loadConfig();
const provider = new LiveProvider(cfg.warningWindowH);

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': cfg.corsOrigin,
  });
  res.end(JSON.stringify(body));
}

function authorized(req: IncomingMessage, url: URL): boolean {
  if (cfg.apiKeys.size === 0) return true;
  const header = req.headers['x-api-key'];
  const key = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get('key') ?? '';
  return cfg.apiKeys.has(key);
}

function statusOf(success: boolean, error: unknown): SourceStatus {
  return {
    state: success ? 'ok' : 'error',
    lastSuccess: success ? new Date().toISOString() : null,
    lastError: success ? null : error instanceof Error ? error.message : String(error),
  };
}

async function snapshot(): Promise<Snapshot> {
  const [warningsResult, weatherResult] = await Promise.allSettled([
    provider.warnings(),
    provider.weather(REGIONS),
  ]);
  const warnings: Warning[] = warningsResult.status === 'fulfilled' ? warningsResult.value : [];
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : [];
  const byRegion = new Map<string, Warning[]>();
  for (const warning of warnings) {
    const list = byRegion.get(warning.areaId) ?? [];
    list.push(warning);
    byRegion.set(warning.areaId, list);
  }
  const weatherByRegion = new Map<string, WeatherPoint>(weather.map((point) => [point.regionId, point]));
  return {
    generatedAt: new Date().toISOString(),
    mode: 'live',
    stormName: cfg.stormName,
    sources: {
      ipma: statusOf(warningsResult.status === 'fulfilled', warningsResult.status === 'rejected' ? warningsResult.reason : null),
      weather: statusOf(weatherResult.status === 'fulfilled', weatherResult.status === 'rejected' ? weatherResult.reason : null),
    },
    regions: REGIONS.map((region) => computeRisk(region, byRegion.get(region.id) ?? [], weatherByRegion.get(region.id)))
      .sort((a, b) => b.score - a.score),
  };
}

function toGeoJson(s: Snapshot) {
  return {
    type: 'FeatureCollection',
    generatedAt: s.generatedAt,
    stormName: s.stormName,
    features: s.regions.map((region) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [region.lon, region.lat] },
      properties: { ...region },
    })),
  };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  res.setHeader('access-control-allow-origin', cfg.corsOrigin);
  res.setHeader('access-control-allow-headers', 'x-api-key');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'metodo nao permitido' });
  if (!authorized(req, url)) return json(res, 401, { error: 'chave de API invalida' });

  if (!['/api/risk', '/api/risk.geojson', '/api/health'].includes(url.pathname)) {
    return json(res, 404, { error: 'endpoint inexistente' });
  }

  try {
    const data = await snapshot();
    if (url.pathname === '/api/risk.geojson') return json(res, 200, toGeoJson(data));
    if (url.pathname === '/api/health') {
      return json(res, 200, {
        status: 'ok',
        mode: 'live',
        hasData: true,
        generatedAt: data.generatedAt,
        sources: data.sources,
      });
    }
    return json(res, 200, data);
  } catch (error) {
    return json(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}
