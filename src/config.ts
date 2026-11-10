export interface Config {
  port: number;
  mode: 'live' | 'mock';
  ipmaPollMs: number;
  weatherPollMs: number;
  warningWindowH: number;
  stormName: string | null;
  apiKeys: Set<string>;
  corsOrigin: string;
  maxSseClients: number;
}

function num(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`Variavel ${name} invalida: "${raw}" (minimo ${min})`);
  }
  return n;
}

export function loadConfig(): Config {
  const mode = process.env.DATA_MODE === 'mock' ? 'mock' : 'live';
  return {
    port: num('PORT', 3000),
    mode,
    ipmaPollMs: num('IPMA_POLL_MS', 5 * 60_000, 10_000),
    weatherPollMs: num('WEATHER_POLL_MS', 15 * 60_000, 30_000),
    warningWindowH: num('WARNING_WINDOW_H', 24),
    stormName: process.env.STORM_NAME?.trim() || null,
    apiKeys: new Set(
      (process.env.API_KEYS ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    ),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
    maxSseClients: num('MAX_SSE_CLIENTS', 500),
  };
}
