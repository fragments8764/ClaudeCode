import { darknessFactor } from './astro';

/**
 * AURORA SCORE — "chance to see aurora right now, here", 0–100.
 *
 *   score = 100 × activity × sky × dark × moon
 *
 * All four factors are 0–1. Multiplying means any single blocker (daylight, overcast)
 * correctly drives the score to ~0, no matter how strong the storm.
 *
 * ACTIVITY (is there aurora within view?)
 *   base   = 0.7·ovationN + 0.3·kpN        (kpN only, if OVATION missing)
 *     ovationN = clamp(visibleOvation / OVATION_FULL)   — OVATION ≥ 30 near Iceland is a strong display
 *     kpN      = clamp((Kp − 0.5) / 5)                  — Kp 2 ≈ 0.3, Kp 5.5 ≈ 1 (Iceland sits under the oval)
 *   + Bz boost   : 15-min avg Bz south adds up to +0.25 (−5 nT ≈ +0.17); north subtracts up to −0.15
 *   + speed boost: (v − 400) / 1000, clamped −0.05…+0.15
 * SKY   = 1 − effectiveCloud/100   (high thin cloud already discounted in effectiveCloud)
 * DARK  = darknessFactor(sunAlt)   (0 above horizon → 1 at −18°; nautical twilight ≈ 0.65)
 * MOON  = 1 − MOON_MAX_PENALTY · illumination · clamp(moonAlt / 30°)
 *
 * Weights live in config/score-weights.json (loaded by the server, served to the app); WEIGHTS below
 * are the defaults. Tests in __tests__/ovation-score.test.ts pin the behaviour.
 */
export const WEIGHTS: Weights = {
  OVATION_FULL: 30,
  OVATION_SHARE: 0.7,
  BZ_SOUTH_PER_NT: 1 / 30,
  BZ_SOUTH_MAX: 0.25,
  BZ_NORTH_PER_NT: 1 / 30,
  BZ_NORTH_MAX: 0.15,
  SPEED_REF: 400,
  SPEED_PER_KMS: 1 / 1000,
  SPEED_MIN: -0.05,
  SPEED_MAX: 0.15,
  MOON_MAX_PENALTY: 0.35,
  /** When cloud data is missing, assume this cover (pessimistic-ish). */
  CLOUD_UNKNOWN: 60,
};

export interface Weights {
  OVATION_FULL: number;
  OVATION_SHARE: number;
  BZ_SOUTH_PER_NT: number;
  BZ_SOUTH_MAX: number;
  BZ_NORTH_PER_NT: number;
  BZ_NORTH_MAX: number;
  SPEED_REF: number;
  SPEED_PER_KMS: number;
  SPEED_MIN: number;
  SPEED_MAX: number;
  MOON_MAX_PENALTY: number;
  CLOUD_UNKNOWN: number;
}

/** Merge a (possibly partial / untrusted) weights object over the defaults, ignoring non-numbers. */
export function resolveWeights(w?: Partial<Record<keyof Weights, unknown>> | null): Weights {
  const out = { ...WEIGHTS };
  if (w) for (const k of Object.keys(WEIGHTS) as (keyof Weights)[]) {
    const v = w[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface ScoreInputs {
  sunAltDeg: number;
  moonAltDeg: number;
  moonIllumination: number;
  /** Effective (sky-blocking) cloud %, null if unknown. */
  cloud: number | null;
  /** OVATION distance-weighted visible value, null if unknown. */
  ovation: number | null;
  kp: number | null;
  /** 15-min average Bz (GSM, nT), null if unknown. */
  bz: number | null;
  speed: number | null;
}

export type FactorKey = 'dark' | 'sky' | 'activity' | 'moon';

export type Verdict = 'go' | 'look' | 'possible' | 'unlikely' | 'wait-dark';

export interface ScoreResult {
  score: number;
  verdict: Verdict;
  /** Short, user-facing verdict line. */
  headline: string;
  factors: Record<FactorKey, number>;
  /** The factor holding the score back most (null when everything is good). */
  limiting: FactorKey | null;
  limitingLabel: string | null;
  /** Inputs that were missing and had to be assumed. */
  missing: (keyof ScoreInputs)[];
}

export const FACTOR_LABEL: Record<FactorKey, string> = {
  dark: 'Daylight',
  sky: 'Clouds',
  activity: 'Quiet sun',
  moon: 'Moonlight',
};

export function activityFactor(i: Pick<ScoreInputs, 'ovation' | 'kp' | 'bz' | 'speed'>, W: Weights = WEIGHTS): number {
  const kpN = i.kp === null ? null : clamp01((i.kp - 0.5) / 5);
  const ovN = i.ovation === null ? null : clamp01(i.ovation / W.OVATION_FULL);
  let base: number;
  if (ovN !== null && kpN !== null) base = W.OVATION_SHARE * ovN + (1 - W.OVATION_SHARE) * kpN;
  else base = ovN ?? kpN ?? 0.25; // neither known → assume "typical quiet night in Iceland"
  let boost = 0;
  if (i.bz !== null) {
    boost += i.bz < 0 ? Math.min(W.BZ_SOUTH_MAX, -i.bz * W.BZ_SOUTH_PER_NT) : -Math.min(W.BZ_NORTH_MAX, i.bz * W.BZ_NORTH_PER_NT);
  }
  if (i.speed !== null) {
    boost += Math.max(W.SPEED_MIN, Math.min(W.SPEED_MAX, (i.speed - W.SPEED_REF) * W.SPEED_PER_KMS));
  }
  // Boosts scale with base: a south Bz can't conjure aurora if the oval is far away.
  return clamp01(base + boost * Math.max(0.4, base));
}

export function moonFactor(illumination: number, altDeg: number, W: Weights = WEIGHTS): number {
  return 1 - W.MOON_MAX_PENALTY * clamp01(illumination) * clamp01(altDeg / 30);
}

export function computeScore(i: ScoreInputs, W: Weights = WEIGHTS): ScoreResult {
  const missing = (Object.keys(i) as (keyof ScoreInputs)[]).filter((k) => i[k] === null);
  const factors: Record<FactorKey, number> = {
    dark: darknessFactor(i.sunAltDeg),
    sky: 1 - (i.cloud ?? W.CLOUD_UNKNOWN) / 100,
    activity: activityFactor(i, W),
    moon: moonFactor(i.moonIllumination, i.moonAltDeg, W),
  };
  const raw = factors.dark * factors.sky * factors.activity * factors.moon;
  const score = Math.round(100 * clamp01(raw));

  // Limiting factor: the smallest factor, if it is meaningfully limiting (< 0.8).
  const sorted = (Object.entries(factors) as [FactorKey, number][]).sort((a, b) => a[1] - b[1]);
  const [minKey, minVal] = sorted[0]!;
  const limiting = minVal < 0.8 ? minKey : null;

  let verdict: Verdict;
  let headline: string;
  if (factors.dark < 0.2) {
    verdict = 'wait-dark';
    headline = 'Wait for darkness';
  } else if (score >= 50) {
    verdict = 'go';
    headline = 'Go outside now';
  } else if (score >= 30) {
    verdict = 'look';
    headline = 'Worth a look';
  } else if (score >= 12) {
    verdict = 'possible';
    headline = 'Possible, keep watching';
  } else {
    verdict = 'unlikely';
    headline = 'Not right now';
  }
  return { score, verdict, headline, factors, limiting, limitingLabel: limiting ? FACTOR_LABEL[limiting] : null, missing };
}

export interface HourOutlook {
  time: string;
  score: number;
  cloud: number | null;
  kp: number | null;
  dark: number;
}

export interface BestWindow {
  start: string;
  end: string;
  /** Mean score across the window. */
  score: number;
  hours: HourOutlook[];
}

/**
 * Forecast-only outlook (no live Bz/OVATION — those are nowcasts) for planning the night.
 * Caller supplies per-hour cloud and Kp, plus a sun/moon sampler.
 */
export function hourlyOutlook(
  hours: { time: string; cloud: number | null; kp: number | null }[],
  sky: (t: Date) => { sunAlt: number; moonAlt: number; moonIllumination: number },
  W: Weights = WEIGHTS,
): HourOutlook[] {
  return hours.map((h) => {
    const s = sky(new Date(h.time));
    const r = computeScore({
      sunAltDeg: s.sunAlt,
      moonAltDeg: s.moonAlt,
      moonIllumination: s.moonIllumination,
      cloud: h.cloud,
      ovation: null,
      kp: h.kp,
      bz: null,
      speed: null,
    }, W);
    return { time: h.time, score: r.score, cloud: h.cloud, kp: h.kp, dark: r.factors.dark };
  });
}

/** Best contiguous `len`-hour window by mean score; null if nothing reaches `minScore`. */
export function bestWindow(outlook: HourOutlook[], len = 2, minScore = 8): BestWindow | null {
  let best: BestWindow | null = null;
  for (let i = 0; i + len <= outlook.length; i++) {
    const slice = outlook.slice(i, i + len);
    const mean = slice.reduce((s, h) => s + h.score, 0) / len;
    if (mean >= minScore && (!best || mean > best.score)) {
      const end = new Date(new Date(slice[len - 1]!.time).getTime() + 3.6e6).toISOString();
      best = { start: slice[0]!.time, end, score: Math.round(mean), hours: slice };
    }
  }
  return best;
}

/** Kp for an arbitrary time from a 3-hourly series (slot containing t). */
export function kpAt(series: { time: string; kp: number }[], t: Date): number | null {
  const iso = t.toISOString();
  let v: number | null = null;
  for (const p of series) {
    if (p.time <= iso) v = p.kp;
    else break;
  }
  return v;
}
