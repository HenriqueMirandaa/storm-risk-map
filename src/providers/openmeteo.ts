import { getJson } from '../http.js';
import type { Region, WeatherPoint } from '../types.js';

const BASE = 'https://api.open-meteo.com/v1/forecast';

interface HourlyBlock {
  precipitation?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
}
interface LocationResponse {
  hourly?: HourlyBlock;
}

const maxOf = (xs: Array<number | null> = []): number =>
  xs.reduce<number>((m, v) => (typeof v === 'number' && v > m ? v : m), 0);
const sumOf = (xs: Array<number | null> = []): number =>
  xs.reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);

/** Converte a resposta (1 objeto ou lista, uma entrada por coordenada) em resumos 24h. Pura (testavel). */
export function summarize(regions: Region[], payload: unknown): WeatherPoint[] {
  const list: LocationResponse[] = Array.isArray(payload)
    ? (payload as LocationResponse[])
    : [payload as LocationResponse];
  if (list.length !== regions.length) {
    throw new Error(`Open-Meteo devolveu ${list.length} locais; esperados ${regions.length}`);
  }
  return regions.map((region, i) => {
    const h = list[i]?.hourly;
    return {
      regionId: region.id,
      maxGustKmh: maxOf(h?.wind_gusts_10m),
      maxPrecipMmH: maxOf(h?.precipitation),
      precip24hMm: sumOf(h?.precipitation),
    };
  });
}

/** Uma unica chamada com todas as coordenadas (lista separada por virgulas). */
export async function fetchWeather(regions: Region[]): Promise<WeatherPoint[]> {
  const url = new URL(BASE);
  url.searchParams.set('latitude', regions.map((r) => r.lat).join(','));
  url.searchParams.set('longitude', regions.map((r) => r.lon).join(','));
  url.searchParams.set('hourly', 'precipitation,wind_gusts_10m');
  url.searchParams.set('forecast_hours', '24');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('timezone', 'UTC');
  const payload = await getJson<unknown>(url.toString(), { timeoutMs: 15_000 });
  return summarize(regions, payload);
}
