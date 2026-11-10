import type { Region } from '../types.js';

/**
 * Distritos de Portugal continental (coordenadas aproximadas das capitais de distrito).
 * `id` segue o formato idAreaAviso do IPMA. NOTA: confirmar estes codigos contra os
 * avisos reais no primeiro arranque em modo live (o servidor regista avisos de areas
 * nao mapeadas). Acores e Madeira ficam fora do MVP.
 */
export const REGIONS: Region[] = [
  { id: 'AVR', name: 'Aveiro', lat: 40.6405, lon: -8.6538, coastal: true },
  { id: 'BJA', name: 'Beja', lat: 38.0151, lon: -7.8632, coastal: true },
  { id: 'BRG', name: 'Braga', lat: 41.5454, lon: -8.4265, coastal: true },
  { id: 'BGC', name: 'Bragança', lat: 41.8058, lon: -6.7572, coastal: false },
  { id: 'CBO', name: 'Castelo Branco', lat: 39.8222, lon: -7.4909, coastal: false },
  { id: 'CBR', name: 'Coimbra', lat: 40.2033, lon: -8.4103, coastal: true },
  { id: 'EVR', name: 'Évora', lat: 38.5714, lon: -7.9135, coastal: false },
  { id: 'FAR', name: 'Faro', lat: 37.0194, lon: -7.9304, coastal: true },
  { id: 'GDA', name: 'Guarda', lat: 40.5373, lon: -7.2658, coastal: false },
  { id: 'LRA', name: 'Leiria', lat: 39.7437, lon: -8.8071, coastal: true },
  { id: 'LSB', name: 'Lisboa', lat: 38.7223, lon: -9.1393, coastal: true },
  { id: 'PTG', name: 'Portalegre', lat: 39.2967, lon: -7.4281, coastal: false },
  { id: 'PTO', name: 'Porto', lat: 41.1579, lon: -8.6291, coastal: true },
  { id: 'STM', name: 'Santarém', lat: 39.2362, lon: -8.6859, coastal: false },
  { id: 'STB', name: 'Setúbal', lat: 38.5244, lon: -8.8882, coastal: true },
  { id: 'VCT', name: 'Viana do Castelo', lat: 41.6918, lon: -8.8344, coastal: true },
  { id: 'VRL', name: 'Vila Real', lat: 41.3006, lon: -7.7441, coastal: false },
  { id: 'VIS', name: 'Viseu', lat: 40.6566, lon: -7.9139, coastal: false },
];

export const REGION_IDS = new Set(REGIONS.map((r) => r.id));
