import { PALETTE, lerpRGB, type RGB } from '../design/tokens';

/**
 * Map live space weather → sky shader parameters.
 *  intensity: Kp (normalised for Iceland) + south-Bz boost, floored by the Aurora Score
 *  speed:     solar wind speed + Bz (a south-turning Bz makes curtains "dance")
 *  colours:   green base always; upper layer shifts teal → violet with Kp; storm tops go magenta/red
 */
export interface SkyParams {
  intensity: number;
  speed: number;
  colA: RGB;
  colB: RGB;
  colC: RGB;
}

const c01 = (x: number) => Math.max(0, Math.min(1, x));

export function skyParams(i: { kp: number | null; bz: number | null; speed: number | null; score: number | null; darkness: number }): SkyParams {
  const kpN = c01(((i.kp ?? 2) - 0.5) / 6);
  const bzBoost = i.bz != null && i.bz < 0 ? Math.min(0.3, -i.bz / 20) : 0;
  let intensity = c01(0.22 + 0.6 * kpN + bzBoost);
  if (i.score != null) intensity = Math.max(intensity, i.score / 100);
  // In daylight/twilight the sky stays calm and faint.
  intensity *= 0.35 + 0.65 * i.darkness;
  const speed = 0.35 + c01(((i.speed ?? 400) - 300) / 500) * 1.1 + bzBoost * 1.5;
  return {
    intensity,
    speed,
    colA: PALETTE.emerald,
    colB: lerpRGB(PALETTE.teal, PALETTE.violet, c01((kpN - 0.25) / 0.5)),
    colC: kpN > 0.75 ? lerpRGB(PALETTE.violet, [235, 60, 90], c01((kpN - 0.75) / 0.25)) : lerpRGB(PALETTE.teal, PALETTE.violet, kpN),
  };
}
