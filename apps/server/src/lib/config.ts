import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Spot } from '@nordurljos/core';

export interface CameraDef {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  kind: string;
  embed: 'image' | 'link';
  imageUrl?: string;
  pageUrl: string;
  attribution: string;
  refreshMin?: number;
  note?: string;
}

/** Reads config/*.json, re-reading when the file changes (edit spots/cameras without a restart). */
export class ConfigLoader {
  private cache = new Map<string, { mtime: number; value: unknown }>();
  constructor(private dir: string | null, private inline?: { spots?: Spot[]; cameras?: CameraDef[] }) {}

  private read<T>(name: string, key: string): T {
    if (!this.dir) return ((this.inline as Record<string, unknown>)?.[key] ?? []) as T;
    const file = join(this.dir, name);
    try {
      const mtime = statSync(file).mtimeMs;
      const c = this.cache.get(file);
      if (c && c.mtime === mtime) return c.value as T;
      const value = (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)[key] as T;
      this.cache.set(file, { mtime, value });
      return value;
    } catch (e) {
      console.error(`[config] failed to read ${file}`, e);
      return (this.cache.get(file)?.value ?? []) as T;
    }
  }

  spots(): Spot[] {
    return this.read<Spot[]>('spots.json', 'spots');
  }
  cameras(): CameraDef[] {
    return this.read<CameraDef[]>('cameras.json', 'cameras');
  }
}
