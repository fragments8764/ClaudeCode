import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Tiny JSON-file store (one file per collection, atomic writes). Good enough for a single
 * instance; swap for KV/SQLite when scaling out. Pass `dir: null` for memory-only (tests).
 */
export class JsonStore<T> {
  private data: T;
  private file: string | null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(dir: string | null, name: string, initial: T) {
    this.file = dir ? join(dir, `${name}.json`) : null;
    this.data = initial;
    if (this.file) {
      try {
        this.data = JSON.parse(readFileSync(this.file, 'utf8')) as T;
      } catch {
        /* first run */
      }
    }
  }

  get(): T {
    return this.data;
  }

  set(next: T) {
    this.data = next;
    this.scheduleWrite();
  }

  update(fn: (d: T) => T) {
    this.set(fn(this.data));
  }

  private scheduleWrite() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 250);
  }

  flush() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
