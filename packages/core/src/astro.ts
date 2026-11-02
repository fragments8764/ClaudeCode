import SunCalc from 'suncalc';
import type { DarknessLevel } from './types';

/**
 * Astronomy helpers (sun, moon, darkness), computed locally — no network.
 *
 * Instead of relying on SunCalc's named twilight times (which return NaN during
 * polar night / midnight sun, both common in Iceland), we sample the sun's
 * altitude across the window. That is robust at any latitude.
 */

const RAD = 180 / Math.PI;
const MIN = 60_000;

/** Sun altitude thresholds (degrees). */
export const SUN = {
  /** Upper limb touches horizon incl. refraction. */
  horizon: -0.833,
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const;

/**
 * Sun altitude below which an aurora is realistically visible.
 * Bright aurora is visible in nautical twilight; we use -12° as "dark enough".
 */
export const AURORA_DARK_ALTITUDE = SUN.nautical;

export function sunAltitudeDeg(date: Date, lat: number, lon: number): number {
  return SunCalc.getPosition(date, lat, lon).altitude * RAD;
}

export function darknessLevel(sunAltDeg: number): DarknessLevel {
  if (sunAltDeg > SUN.horizon) return 'day';
  if (sunAltDeg > SUN.civil) return 'civil';
  if (sunAltDeg > SUN.nautical) return 'nautical';
  if (sunAltDeg > SUN.astronomical) return 'astronomical';
  return 'night';
}

/** 0 = full daylight … 1 = full astronomical night. Linear between horizon and -18°. */
export function darknessFactor(sunAltDeg: number): number {
  if (sunAltDeg >= SUN.horizon) return 0;
  if (sunAltDeg <= SUN.astronomical) return 1;
  return (SUN.horizon - sunAltDeg) / (SUN.horizon - SUN.astronomical);
}

/** SunCalc azimuth is from south, clockwise-west. Convert to compass bearing from north. */
function toBearing(azRad: number): number {
  return (((azRad * RAD + 180) % 360) + 360) % 360;
}

export interface MoonState {
  altitudeDeg: number;
  bearingDeg: number;
  /** 0–1 illuminated fraction */
  illumination: number;
  /** 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter */
  phase: number;
  phaseName: string;
}

export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'New moon';
  if (p < 0.22) return 'Waxing crescent';
  if (p < 0.28) return 'First quarter';
  if (p < 0.47) return 'Waxing gibbous';
  if (p < 0.53) return 'Full moon';
  if (p < 0.72) return 'Waning gibbous';
  if (p < 0.78) return 'Last quarter';
  return 'Waning crescent';
}

export function moonState(date: Date, lat: number, lon: number): MoonState {
  const pos = SunCalc.getMoonPosition(date, lat, lon);
  const ill = SunCalc.getMoonIllumination(date);
  return {
    altitudeDeg: pos.altitude * RAD,
    bearingDeg: toBearing(pos.azimuth),
    illumination: ill.fraction,
    phase: ill.phase,
    phaseName: moonPhaseName(ill.phase),
  };
}

export interface SunState {
  altitudeDeg: number;
  bearingDeg: number;
  darkness: DarknessLevel;
  darknessFactor: number;
}

export function sunState(date: Date, lat: number, lon: number): SunState {
  const pos = SunCalc.getPosition(date, lat, lon);
  const alt = pos.altitude * RAD;
  return { altitudeDeg: alt, bearingDeg: toBearing(pos.azimuth), darkness: darknessLevel(alt), darknessFactor: darknessFactor(alt) };
}

export interface Interval {
  start: string;
  end: string;
}

export interface SkySample {
  time: string;
  sunAlt: number;
  moonAlt: number;
}

/** Sample sun & moon altitude every `stepMin` minutes from `from` for `hours`. */
export function sampleSky(from: Date, lat: number, lon: number, hours = 24, stepMin = 5): SkySample[] {
  const out: SkySample[] = [];
  const n = Math.floor((hours * 60) / stepMin);
  for (let i = 0; i <= n; i++) {
    const t = new Date(from.getTime() + i * stepMin * MIN);
    out.push({
      time: t.toISOString(),
      sunAlt: sunAltitudeDeg(t, lat, lon),
      moonAlt: SunCalc.getMoonPosition(t, lat, lon).altitude * RAD,
    });
  }
  return out;
}

/** Return contiguous intervals where predicate(sample) is true. */
export function intervalsWhere(samples: SkySample[], pred: (s: SkySample) => boolean): Interval[] {
  const out: Interval[] = [];
  let start: string | null = null;
  let last: string | null = null;
  for (const s of samples) {
    if (pred(s)) {
      if (start === null) start = s.time;
      last = s.time;
    } else if (start !== null) {
      out.push({ start, end: s.time });
      start = null;
    }
  }
  if (start !== null && last !== null) out.push({ start, end: last });
  return out;
}

/** Find the first crossing of `threshold` in the given direction. */
function firstCrossing(
  samples: SkySample[],
  key: 'sunAlt' | 'moonAlt',
  threshold: number,
  dir: 'down' | 'up',
): string | null {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const crossed = dir === 'down' ? a[key] > threshold && b[key] <= threshold : a[key] < threshold && b[key] >= threshold;
    if (crossed) {
      // linear interpolation for a better-than-step estimate
      const f = (threshold - a[key]) / (b[key] - a[key]);
      const t = new Date(a.time).getTime() + f * (new Date(b.time).getTime() - new Date(a.time).getTime());
      return new Date(Math.round(t / MIN) * MIN).toISOString();
    }
  }
  return null;
}

export interface NightPlan {
  /** Window start (usually "now"). */
  from: string;
  to: string;
  sunset: string | null;
  sunrise: string | null;
  /** First time sun dips below -12° (dark enough for aurora). */
  darkStart: string | null;
  /** First time sun climbs back above -12°. */
  darkEnd: string | null;
  astroDarkStart: string | null;
  astroDarkEnd: string | null;
  /** All intervals in the window where the sun is below -12°. */
  darkIntervals: Interval[];
  moonrise: string | null;
  moonset: string | null;
  /** Intervals where the moon is above the horizon. */
  moonUpIntervals: Interval[];
  /** Highest moon altitude during dark intervals (deg), null if no darkness. */
  moonMaxAltDuringDark: number | null;
  moon: MoonState;
  /** True if the window contains no darkness at all (e.g. midsummer). */
  noDarkness: boolean;
  /** True if it is dark right now. */
  darkNow: boolean;
  samples: SkySample[];
}

/**
 * Plan the next `hours` (default 24) from `now`: sun/moon events, dark windows.
 * Starts slightly in the past so that "already dark" is reported correctly.
 */
export function planNight(now: Date, lat: number, lon: number, hours = 24, stepMin = 5): NightPlan {
  const samples = sampleSky(now, lat, lon, hours, stepMin);
  const darkPred = (s: SkySample) => s.sunAlt <= AURORA_DARK_ALTITUDE;
  const darkIntervals = intervalsWhere(samples, darkPred);
  const moonUpIntervals = intervalsWhere(samples, (s) => s.moonAlt > 0);
  const darkSamples = samples.filter(darkPred);
  const first = samples[0]!;
  return {
    from: first.time,
    to: samples[samples.length - 1]!.time,
    sunset: firstCrossing(samples, 'sunAlt', SUN.horizon, 'down'),
    sunrise: firstCrossing(samples, 'sunAlt', SUN.horizon, 'up'),
    darkStart: darkPred(first) ? first.time : firstCrossing(samples, 'sunAlt', AURORA_DARK_ALTITUDE, 'down'),
    darkEnd: firstCrossing(samples, 'sunAlt', AURORA_DARK_ALTITUDE, 'up'),
    astroDarkStart: first.sunAlt <= SUN.astronomical ? first.time : firstCrossing(samples, 'sunAlt', SUN.astronomical, 'down'),
    astroDarkEnd: firstCrossing(samples, 'sunAlt', SUN.astronomical, 'up'),
    darkIntervals,
    moonrise: firstCrossing(samples, 'moonAlt', 0, 'up'),
    moonset: firstCrossing(samples, 'moonAlt', 0, 'down'),
    moonUpIntervals,
    moonMaxAltDuringDark: darkSamples.length ? Math.max(...darkSamples.map((s) => s.moonAlt)) : null,
    moon: moonState(now, lat, lon),
    noDarkness: darkIntervals.length === 0,
    darkNow: darkPred(first),
    samples,
  };
}
