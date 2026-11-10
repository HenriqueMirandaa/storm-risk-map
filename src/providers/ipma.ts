import { getJson } from '../http.js';
import type { AwarenessLevel, Warning } from '../types.js';

const WARNINGS_URL = 'https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json';

interface RawWarning {
  text?: string;
  awarenessTypeName?: string;
  idAreaAviso?: string;
  awarenessLevelID?: string;
  startTime?: string;
  endTime?: string;
}

const LEVELS = new Set<AwarenessLevel>(['green', 'yellow', 'orange', 'red']);

/** Normaliza e filtra avisos: ativos agora ou a comecar dentro da janela. Funcao pura (testavel). */
export function normalizeWarnings(
  raw: unknown,
  now: number,
  windowHours: number,
): Warning[] {
  if (!Array.isArray(raw)) throw new Error('Resposta inesperada do IPMA (nao e uma lista)');
  const horizon = now + windowHours * 3_600_000;
  const out: Warning[] = [];

  for (const item of raw as RawWarning[]) {
    const level = item.awarenessLevelID?.toLowerCase() as AwarenessLevel | undefined;
    if (!item.idAreaAviso || !item.awarenessTypeName || !level || !LEVELS.has(level)) continue;
    if (level === 'green') continue;

    const start = Date.parse(item.startTime ?? '');
    const end = Date.parse(item.endTime ?? '');
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (end < now || start > horizon) continue;

    out.push({
      areaId: item.idAreaAviso,
      type: item.awarenessTypeName,
      level,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      ...(item.text ? { text: item.text } : {}),
    });
  }
  return out;
}

export async function fetchWarnings(windowHours: number): Promise<Warning[]> {
  const raw = await getJson<unknown>(WARNINGS_URL);
  return normalizeWarnings(raw, Date.now(), windowHours);
}
