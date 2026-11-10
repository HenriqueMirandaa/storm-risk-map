import type {
  AwarenessLevel,
  Region,
  RegionRisk,
  RiskFactors,
  RiskLevel,
  Warning,
  WeatherPoint,
} from '../types.js';

/**
 * Motor de risco (0-100), deliberadamente simples e explicavel:
 *   score = max( 0.45*aviso + 0.30*vento + 0.25*chuva , 0.8*aviso )
 * Os pesos e as tabelas abaixo sao heuristicas de MVP: calibrar com historico
 * (ex.: tempestades de 2026) antes de apresentar como indicador fiavel.
 */

const LEVEL_POINTS: Record<AwarenessLevel, number> = {
  green: 0,
  yellow: 25,
  orange: 55,
  red: 85,
};

type WarningKind = 'rain' | 'wind' | 'thunder' | 'snow' | 'sea' | 'fog' | 'temp' | 'other';

const KIND_WEIGHT: Record<WarningKind, number> = {
  rain: 1,
  wind: 1,
  thunder: 0.8,
  snow: 0.8,
  sea: 0.6, // so conta em distritos costeiros
  fog: 0.2,
  temp: 0,
  other: 0.3,
};

const WIND_CURVE: Array<[number, number]> = [
  [40, 0],
  [60, 15],
  [80, 40],
  [100, 65],
  [120, 90],
  [140, 100],
]; // rajada km/h -> 0-100

const RAIN_HOURLY_CURVE: Array<[number, number]> = [
  [1, 0],
  [4, 15],
  [10, 45],
  [20, 80],
  [30, 100],
]; // mm/h -> 0-100

const RAIN_24H_CURVE: Array<[number, number]> = [
  [20, 0],
  [40, 20],
  [80, 55],
  [120, 85],
  [160, 100],
]; // mm em 24h -> 0-100

/** Interpolacao linear por troços, saturada nas pontas. */
export function interpolate(x: number, pts: Array<[number, number]>): number {
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return last[1];
}

export function classifyWarningType(name: string): WarningKind {
  const n = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (n.includes('precipita')) return 'rain';
  if (n.includes('vento')) return 'wind';
  if (n.includes('trovoada')) return 'thunder';
  if (n.includes('neve')) return 'snow';
  if (n.includes('agitacao') || n.includes('maritima')) return 'sea';
  if (n.includes('nevoeiro')) return 'fog';
  if (n.includes('tempo quente') || n.includes('tempo frio')) return 'temp';
  return 'other';
}

export function warningComponent(warnings: Warning[], coastal: boolean): number {
  const scores = warnings
    .map((w) => {
      const kind = classifyWarningType(w.type);
      const weight = kind === 'sea' && !coastal ? 0 : KIND_WEIGHT[kind];
      return LEVEL_POINTS[w.level] * weight;
    })
    .filter((s) => s > 0)
    .sort((a, b) => b - a);
  const top = scores[0];
  if (top === undefined) return 0;
  // bonus pequeno por avisos simultaneos (ex.: vento + precipitacao + agitacao)
  const bonus = Math.min(15, (scores.length - 1) * 5);
  return Math.min(100, top + bonus);
}

export function levelFromScore(score: number): RiskLevel {
  if (score < 25) return 'low';
  if (score < 50) return 'moderate';
  if (score < 75) return 'high';
  return 'extreme';
}

export function computeRisk(
  region: Region,
  warnings: Warning[],
  weather: WeatherPoint | undefined,
): RegionRisk {
  const factors: RiskFactors = {
    warning: warningComponent(warnings, region.coastal),
    wind: weather ? interpolate(weather.maxGustKmh, WIND_CURVE) : 0,
    rain: weather
      ? Math.max(
          interpolate(weather.maxPrecipMmH, RAIN_HOURLY_CURVE),
          interpolate(weather.precip24hMm, RAIN_24H_CURVE),
        )
      : 0,
  };

  const weighted = 0.45 * factors.warning + 0.3 * factors.wind + 0.25 * factors.rain;
  const score = Math.round(Math.max(weighted, 0.8 * factors.warning));

  const topWarnings = [...warnings]
    .filter((w) => w.level !== 'green')
    .sort((a, b) => LEVEL_POINTS[b.level] - LEVEL_POINTS[a.level])
    .slice(0, 3)
    .map(({ type, level, start, end }) => ({ type, level, start, end }));

  return {
    id: region.id,
    name: region.name,
    lat: region.lat,
    lon: region.lon,
    score,
    level: levelFromScore(score),
    factors: {
      warning: Math.round(factors.warning),
      wind: Math.round(factors.wind),
      rain: Math.round(factors.rain),
    },
    gustKmh: weather ? Math.round(weather.maxGustKmh) : null,
    precipMmH: weather ? Math.round(weather.maxPrecipMmH * 10) / 10 : null,
    precip24hMm: weather ? Math.round(weather.precip24hMm * 10) / 10 : null,
    hasWeather: weather !== undefined,
    warnings: topWarnings,
  };
}
