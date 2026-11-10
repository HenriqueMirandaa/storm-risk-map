import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyWarningType, computeRisk, interpolate, levelFromScore } from '../src/risk/score.js';
import { normalizeWarnings } from '../src/providers/ipma.js';
import { summarize } from '../src/providers/openmeteo.js';
import type { Region, Warning } from '../src/types.js';

const coastal: Region = { id: 'LSB', name: 'Lisboa', lat: 38.7, lon: -9.1, coastal: true };
const inland: Region = { id: 'GDA', name: 'Guarda', lat: 40.5, lon: -7.3, coastal: false };

const warn = (type: string, level: Warning['level']): Warning => ({
  areaId: 'X',
  type,
  level,
  start: '2026-11-10T00:00:00.000Z',
  end: '2026-11-11T00:00:00.000Z',
});

test('interpolate satura nas pontas e interpola no meio', () => {
  const pts: Array<[number, number]> = [
    [0, 0],
    [10, 100],
  ];
  assert.equal(interpolate(-5, pts), 0);
  assert.equal(interpolate(5, pts), 50);
  assert.equal(interpolate(99, pts), 100);
});

test('classifyWarningType ignora acentos e maiusculas', () => {
  assert.equal(classifyWarningType('Precipitação'), 'rain');
  assert.equal(classifyWarningType('VENTO'), 'wind');
  assert.equal(classifyWarningType('Agitação Marítima'), 'sea');
  assert.equal(classifyWarningType('Tempo Quente'), 'temp');
});

test('sem dados nem avisos => risco baixo (0)', () => {
  const r = computeRisk(inland, [], undefined);
  assert.equal(r.score, 0);
  assert.equal(r.level, 'low');
  assert.equal(r.hasWeather, false);
});

test('aviso vermelho de vento => pelo menos risco alto mesmo sem dados meteo', () => {
  const r = computeRisk(coastal, [warn('Vento', 'red')], undefined);
  assert.ok(r.score >= 68, `score ${r.score}`);
  assert.ok(['high', 'extreme'].includes(r.level));
});

test('agitacao maritima nao conta no interior', () => {
  const sea = [warn('Agitação Marítima', 'red')];
  assert.equal(computeRisk(inland, sea, undefined).score, 0);
  assert.ok(computeRisk(coastal, sea, undefined).score > 0);
});

test('rajadas e chuva fortes sem avisos aumentam o risco', () => {
  const r = computeRisk(coastal, [], {
    regionId: 'LSB',
    maxGustKmh: 120,
    maxPrecipMmH: 20,
    precip24hMm: 120,
  });
  assert.ok(r.factors.wind >= 85);
  assert.ok(r.factors.rain >= 80);
  assert.ok(r.score >= 25);
});

test('score fica sempre entre 0 e 100 e levelFromScore respeita limiares', () => {
  const r = computeRisk(
    coastal,
    [warn('Vento', 'red'), warn('Precipitação', 'red'), warn('Agitação Marítima', 'red')],
    { regionId: 'LSB', maxGustKmh: 300, maxPrecipMmH: 100, precip24hMm: 500 },
  );
  assert.ok(r.score <= 100 && r.score >= 0);
  assert.equal(levelFromScore(24), 'low');
  assert.equal(levelFromScore(25), 'moderate');
  assert.equal(levelFromScore(50), 'high');
  assert.equal(levelFromScore(75), 'extreme');
});

test('normalizeWarnings: filtra verdes, expirados e fora da janela', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const raw = [
    { idAreaAviso: 'LSB', awarenessTypeName: 'Vento', awarenessLevelID: 'orange', startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T20:00:00' },
    { idAreaAviso: 'LSB', awarenessTypeName: 'Vento', awarenessLevelID: 'green', startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T20:00:00' },
    { idAreaAviso: 'PTO', awarenessTypeName: 'Vento', awarenessLevelID: 'red', startTime: '2026-11-09T00:00:00', endTime: '2026-11-09T06:00:00' },
    { idAreaAviso: 'FAR', awarenessTypeName: 'Vento', awarenessLevelID: 'red', startTime: '2026-11-13T00:00:00', endTime: '2026-11-13T06:00:00' },
    { idAreaAviso: 'BRG', awarenessTypeName: 'Vento', awarenessLevelID: 'purple', startTime: '2026-11-10T10:00:00', endTime: '2026-11-10T20:00:00' },
  ];
  const out = normalizeWarnings(raw, now, 24);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.areaId, 'LSB');
  assert.throws(() => normalizeWarnings({ erro: true }, now, 24));
});

test('summarize (Open-Meteo): lista de locais e local unico', () => {
  const payload = [
    { hourly: { precipitation: [0, 2, 5.5], wind_gusts_10m: [30, 80, null] } },
    { hourly: { precipitation: [1, 1, 1], wind_gusts_10m: [10, 20, 15] } },
  ];
  const out = summarize([coastal, inland], payload);
  assert.equal(out[0]?.maxGustKmh, 80);
  assert.equal(out[0]?.maxPrecipMmH, 5.5);
  assert.equal(out[0]?.precip24hMm, 7.5);
  assert.equal(summarize([coastal], payload[0]).length, 1);
  assert.throws(() => summarize([coastal, inland, coastal], payload));
});
