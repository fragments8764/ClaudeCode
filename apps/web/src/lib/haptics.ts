import { useSettings } from './store';

const PATTERNS = {
  tap: 8,
  tick: 4,
  select: [6, 30, 6],
  success: [12, 60, 18],
  nudge: [20, 80, 20, 80, 30],
} as const;

/** Subtle haptic feedback (Android / Capacitor later). No-op where unsupported or disabled. */
export function haptic(kind: keyof typeof PATTERNS = 'tap') {
  if (!useSettings.getState().haptics) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    /* ignore */
  }
}
