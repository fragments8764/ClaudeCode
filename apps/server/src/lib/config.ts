import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveWeights, type Spot, type Weights } from '@nordurljos/core';

export interface FeatureFlag {
  tier: 'free' | 'pro';
  enabled: boolean;
  description?: string;
}

export interface CameraDef {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  kind: string;
  embed: 'image' | 'link' | 'video';
  imageUrl?: string;
  /** embed: 'video' — a stream whose owner allows embedding (checked via oEmbed) */
  video?: { provider: 'youtube'; id: string };
  pageUrl: string;
  attribution: string;
  refreshMin?: number;
  note?: string;
}

/** Reads config/*.json, re-reading when the file changes (edit spots/cameras without a restart). */
export class ConfigLoader {
  private cache = new Map<string, { mtime: number; value: unknown }>();
  constructor(private dir: string | null, private inline?: { spots?: Spot[]; cameras?: CameraDef[]; weights?: Partial<Weights>; features?: Record<string, FeatureFlag> }) {}

  private read<T>(name: string, key: string): T {
    if (!this.dir) return ((this.inline as Record<string, unknown>)?.[key] ?? []) as T;
    const file = join(this.dir, name);
    const ck = `${file}#${key}`; // cache per file AND key (one file can hold several keys)
    try {
      const mtime = statSync(file).mtimeMs;
      const c = this.cache.get(ck);
      if (c && c.mtime === mtime) return c.value as T;
      const value = (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)[key] as T;
      this.cache.set(ck, { mtime, value });
      return value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`[config] failed to read ${file}`, e);
      return (this.cache.get(ck)?.value ?? undefined) as T;
    }
  }

  spots(): Spot[] {
    return this.read<Spot[] | undefined>('spots.json', 'spots') ?? [];
  }
  cameras(): CameraDef[] {
    return this.read<CameraDef[] | undefined>('cameras.json', 'cameras') ?? [];
  }
  /** Score weights from config/score-weights.json, merged over the defaults (bad values ignored). */
  weights(): { version: string; weights: Weights } {
    if (!this.dir) return { version: 'inline', weights: resolveWeights(this.inline?.weights ?? null) };
    const w = this.read<Record<string, unknown> | undefined>('score-weights.json', 'weights');
    const v = this.read<string | undefined>('score-weights.json', 'version');
    return { version: typeof v === 'string' ? v : 'default', weights: resolveWeights(w && !Array.isArray(w) ? w : null) };
  }
  /** Feature flags (config/features.json) — free vs. future pro tier; all enabled for now. */
  features(): Record<string, FeatureFlag> {
    if (!this.dir) return this.inline?.features ?? {};
    const f = this.read<Record<string, FeatureFlag> | undefined>('features.json', 'features');
    return f && !Array.isArray(f) ? f : {};
  }
}
