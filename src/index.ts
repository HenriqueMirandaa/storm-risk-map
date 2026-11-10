import { loadConfig } from './config.js';
import { LiveProvider } from './providers/live.js';
import { MockProvider } from './providers/mock.js';
import { Scheduler } from './scheduler.js';
import { createAppServer } from './server.js';
import { SnapshotStore } from './store.js';

const cfg = loadConfig();
const store = new SnapshotStore();
store.setMaxListeners(cfg.maxSseClients + 10);

const provider = cfg.mode === 'mock' ? new MockProvider() : new LiveProvider(cfg.warningWindowH);
const scheduler = new Scheduler(provider, store, cfg);
const server = createAppServer(cfg, store);

scheduler.start();
server.listen(cfg.port, () => {
  console.log(`storm-risk-map a correr em http://localhost:${cfg.port} (modo: ${cfg.mode})`);
  if (cfg.apiKeys.size > 0) console.log('API protegida por chave (x-api-key ou ?key=)');
});

function shutdown(signal: string): void {
  console.log(`${signal} recebido, a terminar...`);
  scheduler.stop();
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
