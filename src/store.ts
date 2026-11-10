import { EventEmitter } from 'node:events';
import type { Snapshot } from './types.js';

/** Guarda o ultimo snapshot em memoria e avisa os subscritores (SSE). */
export class SnapshotStore extends EventEmitter {
  private current: Snapshot | null = null;

  get(): Snapshot | null {
    return this.current;
  }

  set(snapshot: Snapshot): void {
    this.current = snapshot;
    this.emit('update', snapshot);
  }
}
