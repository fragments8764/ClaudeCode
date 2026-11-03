import { freshness } from '@nordurljos/core';
import type { SourceMeta } from './types';

/**
 * Never show stale data as live: classify every source behind what's on screen.
 * A source is "stale" when the server served it from cache after an upstream failure, or
 * when its fetch time is older than 2× its normal refresh (e.g. we're offline on cached data).
 */
const LABEL: Record<string, string> = {
  'open-meteo': 'Cloud',
  'met-norway': 'Cloud',
  'noaa-kp': 'Kp',
  'noaa-kp-forecast': 'Kp forecast',
  'noaa-rtsw-wind': 'Solar wind',
  'noaa-rtsw-mag': 'Solar wind',
  'noaa-ovation': 'Aurora oval',
};

export interface StaleInfo {
  label: string;
  ageMin: number;
  reason: 'cached-after-failure' | 'old';
}

export function staleSources(sources: SourceMeta[], now = new Date()): StaleInfo[] {
  const out = new Map<string, StaleInfo>();
  // if one of two redundant sources is fine, the data type isn't stale
  const okLabels = new Set(sources.filter((s) => s.ok && !s.stale && freshness(s.fetchedAt, s.ttlSec ?? 600, now).state === 'live').map((s) => LABEL[s.id]));
  for (const s of sources) {
    const label = LABEL[s.id];
    if (!label || okLabels.has(label) || !s.fetchedAt) continue;
    const f = freshness(s.fetchedAt, s.ttlSec ?? 600, now);
    if (s.stale || f.state !== 'live') {
      const prev = out.get(label);
      const info: StaleInfo = { label, ageMin: f.ageMin ?? 0, reason: s.stale ? 'cached-after-failure' : 'old' };
      if (!prev || info.ageMin > prev.ageMin) out.set(label, info);
    }
  }
  return [...out.values()].sort((a, b) => b.ageMin - a.ageMin);
}

export function ageText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}
