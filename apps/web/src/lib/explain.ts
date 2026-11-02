import type { DarknessLevel } from '@nordurljos/core';

/**
 * Per-factor traffic lights + one friendly sentence each.
 * These are *display* heuristics; the weighted Aurora Score lives in @nordurljos/core (Phase 2).
 */
export type Level = 'good' | 'ok' | 'bad' | 'unknown';

export interface Factor {
  level: Level;
  value: string;
  sentence: string;
}

export function darknessFactorView(level: DarknessLevel): Factor {
  switch (level) {
    case 'night':
      return { level: 'good', value: 'Fully dark', sentence: 'The sky is as dark as it gets. Perfect for faint aurora.' };
    case 'astronomical':
      return { level: 'good', value: 'Dark', sentence: 'Dark enough for all but the faintest aurora.' };
    case 'nautical':
      return { level: 'ok', value: 'Twilight', sentence: 'Bright aurora shows now; faint arcs need a darker sky.' };
    case 'civil':
      return { level: 'bad', value: 'Dusk / dawn', sentence: 'Still too bright except for a major storm.' };
    default:
      return { level: 'bad', value: 'Daylight', sentence: 'The sun is up, so no aurora is visible. Check back after dark.' };
  }
}

export function cloudFactor(effective: number | null): Factor {
  if (effective === null) return { level: 'unknown', value: '—', sentence: 'No cloud data yet.' };
  const v = `${Math.round(effective)}%`;
  if (effective <= 30) return { level: 'good', value: v, sentence: 'Mostly clear. Clouds won’t get in the way.' };
  if (effective <= 70) return { level: 'ok', value: v, sentence: 'Partly cloudy. Look for gaps, or drive to clearer sky.' };
  return { level: 'bad', value: v, sentence: 'Overcast. Even a strong aurora would be hidden here.' };
}

export function kpFactor(kp: number | null): Factor {
  if (kp === null) return { level: 'unknown', value: '—', sentence: 'No Kp data yet.' };
  const v = `Kp ${kp.toFixed(1)}`;
  // Iceland sits under the auroral oval: Kp 2–3 is often enough on a clear, dark night.
  if (kp >= 4) return { level: 'good', value: v, sentence: 'Strong activity. Aurora can fill the whole sky over Iceland.' };
  if (kp >= 2) return { level: 'ok', value: v, sentence: 'Moderate activity, often enough in Iceland. Look north first.' };
  return { level: 'bad', value: v, sentence: 'Quiet geomagnetic field. Faint glow possible, usually low in the north.' };
}

export function bzFactor(bz: number | null): Factor {
  if (bz === null) return { level: 'unknown', value: '—', sentence: 'No magnetic field data yet.' };
  const v = `${bz > 0 ? '+' : ''}${bz.toFixed(1)} nT`;
  if (bz <= -5) return { level: 'good', value: v, sentence: 'Bz is strongly south: the door to Earth’s field is wide open.' };
  if (bz < 0) return { level: 'ok', value: v, sentence: 'Bz is tilting south: energy is leaking in.' };
  return { level: 'bad', value: v, sentence: 'Bz points north: the door is mostly shut for now.' };
}

export function speedFactor(speed: number | null | undefined): Factor {
  if (speed == null) return { level: 'unknown', value: '—', sentence: 'No solar wind data yet.' };
  const v = `${Math.round(speed)} km/s`;
  if (speed >= 550) return { level: 'good', value: v, sentence: 'Fast solar wind is pushing hard on Earth’s field.' };
  if (speed >= 400) return { level: 'ok', value: v, sentence: 'Normal-to-brisk solar wind.' };
  return { level: 'bad', value: v, sentence: 'Slow, calm solar wind.' };
}

export function moonFactor(illumination: number, altitudeDeg: number): Factor {
  const pct = Math.round(illumination * 100);
  if (altitudeDeg <= 0) return { level: 'good', value: `Set (${pct}%)`, sentence: 'The moon is below the horizon: no moonlight.' };
  if (illumination > 0.7) return { level: 'bad', value: `Up, ${pct}%`, sentence: 'Bright moon washes out faint aurora. Strong displays still shine.' };
  if (illumination > 0.3) return { level: 'ok', value: `Up, ${pct}%`, sentence: 'Some moonlight. It lights the landscape nicely for photos.' };
  return { level: 'good', value: `Up, ${pct}%`, sentence: 'Thin moon, little light pollution.' };
}

export const levelColor: Record<Level, string> = {
  good: 'text-good',
  ok: 'text-fair',
  bad: 'text-poor',
  unknown: 'text-ink-3',
};
export const levelLabel: Record<Level, string> = { good: 'Good', ok: 'Fair', bad: 'Poor', unknown: 'Unknown' };

export { hhmm } from './format';
