import type { AwarenessLevel, DataProvider, Region, Warning, WeatherPoint } from '../types.js';
import { REGIONS } from '../data/regions.js';

/**
 * Tempestade simulada que entra pelo Atlantico a sul e sobe a costa (ciclo de 2h).
 * Serve para desenvolver o frontend e fazer demos sem depender das APIs reais.
 */
function stormCenter(now = Date.now()): { lat: number; lon: number } {
  const t = ((now / 60_000) % 120) / 120; // 0..1 a cada 2h
  return { lat: 36.5 + 7 * t, lon: -12.5 + 3.5 * t };
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const intensityAt = (region: Region, c: { lat: number; lon: number }): number =>
  Math.exp(-((haversineKm(region.lat, region.lon, c.lat, c.lon) / 220) ** 2));

export class MockProvider implements DataProvider {
  readonly name = 'mock';

  async warnings(): Promise<Warning[]> {
    const c = stormCenter();
    const now = Date.now();
    const out: Warning[] = [];
    for (const r of REGIONS) {
      const k = intensityAt(r, c);
      const level: AwarenessLevel = k > 0.75 ? 'red' : k > 0.5 ? 'orange' : k > 0.25 ? 'yellow' : 'green';
      if (level === 'green') continue;
      const base = {
        areaId: r.id,
        level,
        start: new Date(now - 3_600_000).toISOString(),
        end: new Date(now + 6 * 3_600_000).toISOString(),
      };
      out.push({ ...base, type: 'Vento' }, { ...base, type: 'Precipitação' });
      if (r.coastal) out.push({ ...base, type: 'Agitação Marítima' });
    }
    return out;
  }

  async weather(regions: Region[]): Promise<WeatherPoint[]> {
    const c = stormCenter();
    return regions.map((r) => {
      const k = intensityAt(r, c);
      return {
        regionId: r.id,
        maxGustKmh: 25 + 110 * k,
        maxPrecipMmH: 1 + 24 * k,
        precip24hMm: 5 + 130 * k,
      };
    });
  }
}
