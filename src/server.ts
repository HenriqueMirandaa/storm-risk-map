import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import type { SnapshotStore } from './store.js';
import type { Snapshot } from './types.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function toGeoJson(s: Snapshot) {
  return {
    type: 'FeatureCollection',
    generatedAt: s.generatedAt,
    stormName: s.stormName,
    features: s.regions.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: { ...r },
    })),
  };
}

export function createAppServer(cfg: Config, store: SnapshotStore): Server {
  let sseClients = 0;

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };

  const authorized = (req: IncomingMessage, url: URL): boolean => {
    if (cfg.apiKeys.size === 0) return true;
    const header = req.headers['x-api-key'];
    const key = (Array.isArray(header) ? header[0] : header) ?? url.searchParams.get('key') ?? '';
    return cfg.apiKeys.has(key);
  };

  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return json(res, 400, { error: 'pedido invalido' });
    }
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
      return json(res, 403, { error: 'proibido' });
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(data);
    } catch {
      json(res, 404, { error: 'nao encontrado' });
    }
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    res.setHeader('access-control-allow-origin', cfg.corsOrigin);
    res.setHeader('access-control-allow-headers', 'x-api-key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return void res.end();
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'metodo nao permitido' });

    if (url.pathname === '/api/health') {
      const s = store.get();
      return json(res, 200, {
        status: 'ok',
        mode: cfg.mode,
        hasData: s !== null,
        generatedAt: s?.generatedAt ?? null,
        sources: s?.sources ?? null,
      });
    }

    if (url.pathname.startsWith('/api/')) {
      if (!authorized(req, url)) return json(res, 401, { error: 'chave de API invalida' });
      const snapshot = store.get();

      if (url.pathname === '/api/risk') {
        return snapshot ? json(res, 200, snapshot) : json(res, 503, { error: 'a iniciar, sem dados ainda' });
      }
      if (url.pathname === '/api/risk.geojson') {
        return snapshot ? json(res, 200, toGeoJson(snapshot)) : json(res, 503, { error: 'a iniciar, sem dados ainda' });
      }
      if (url.pathname === '/api/stream') {
        if (sseClients >= cfg.maxSseClients) return json(res, 503, { error: 'demasiadas ligacoes' });
        sseClients += 1;
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        const send = (s: Snapshot): void => void res.write(`event: snapshot\ndata: ${JSON.stringify(s)}\n\n`);
        res.write('retry: 5000\n\n');
        const initial = store.get();
        if (initial) send(initial);
        store.on('update', send);
        const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
        req.on('close', () => {
          clearInterval(heartbeat);
          store.off('update', send);
          sseClients -= 1;
        });
        return;
      }
      return json(res, 404, { error: 'endpoint inexistente' });
    }

    void serveStatic(url.pathname, res);
  });
}
