export type AwarenessLevel = 'green' | 'yellow' | 'orange' | 'red';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'extreme';

/** Aviso meteorologico normalizado (origem: IPMA warnings_www.json). */
export interface Warning {
  areaId: string;
  type: string;
  level: AwarenessLevel;
  start: string; // ISO
  end: string; // ISO
  text?: string;
}

/** Unidade geografica do MVP (distrito do continente). */
export interface Region {
  id: string; // codigo idAreaAviso do IPMA
  name: string;
  lat: number;
  lon: number;
  coastal: boolean;
}

/** Resumo meteorologico das proximas 24h para uma regiao (origem: Open-Meteo). */
export interface WeatherPoint {
  regionId: string;
  maxGustKmh: number;
  maxPrecipMmH: number;
  precip24hMm: number;
}

export interface RiskFactors {
  warning: number; // 0-100
  wind: number; // 0-100
  rain: number; // 0-100
}

export interface RegionRisk {
  id: string;
  name: string;
  lat: number;
  lon: number;
  score: number; // 0-100
  level: RiskLevel;
  factors: RiskFactors;
  gustKmh: number | null;
  precipMmH: number | null;
  precip24hMm: number | null;
  hasWeather: boolean;
  warnings: Array<Pick<Warning, 'type' | 'level' | 'start' | 'end'>>;
}

export interface SourceStatus {
  state: 'pending' | 'ok' | 'stale' | 'error';
  lastSuccess: string | null;
  lastError: string | null;
}

export interface Snapshot {
  generatedAt: string;
  mode: 'live' | 'mock';
  stormName: string | null;
  sources: { ipma: SourceStatus; weather: SourceStatus };
  regions: RegionRisk[];
}

/** Contrato que qualquer fonte de dados (real ou simulada) tem de cumprir. */
export interface DataProvider {
  readonly name: string;
  warnings(): Promise<Warning[]>;
  weather(regions: Region[]): Promise<WeatherPoint[]>;
}
