/**
 * Design tokens for JS (springs, score colours, sky palette).
 * CSS tokens live in tokens.css — keep the two in sync.
 */
import type { Transition } from 'motion/react';

/** House spring: snappy, settles fast, never linear. */
export const spring: Transition = { type: 'spring', stiffness: 300, damping: 30, mass: 1 };
export const springSoft: Transition = { type: 'spring', stiffness: 200, damping: 28 };
export const springSnappy: Transition = { type: 'spring', stiffness: 520, damping: 38 };
/** Reduced motion: short cross-fade, no travel. */
export const calm: Transition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] };

export const PRESS_SCALE = 0.96;

export const STAGGER = 0.06;

export type RGB = [number, number, number];

export const PALETTE = {
  grey: [148, 163, 184] as RGB,
  teal: [45, 212, 191] as RGB,
  emerald: [74, 222, 128] as RGB,
  violet: [167, 139, 250] as RGB,
  magenta: [244, 114, 182] as RGB,
  nightRed: [190, 35, 35] as RGB,
};

/** Score colour ramp: grey → teal → green → magenta at peak. */
const RAMP: [number, RGB][] = [
  [0, PALETTE.grey],
  [25, PALETTE.teal],
  [55, PALETTE.emerald],
  [85, PALETTE.magenta],
  [100, PALETTE.magenta],
];

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;
}

export function scoreColor(score: number): RGB {
  const s = Math.max(0, Math.min(100, score));
  for (let i = 1; i < RAMP.length; i++) {
    const [s1, c1] = RAMP[i]!;
    const [s0, c0] = RAMP[i - 1]!;
    if (s <= s1) return lerpRGB(c0, c1, (s - s0) / (s1 - s0 || 1));
  }
  return PALETTE.magenta;
}

export const rgb = (c: RGB, a = 1) => (a === 1 ? `rgb(${c.join(' ')})` : `rgb(${c.join(' ')} / ${a})`);
