import { darknessFactor, moonState, sunAltitudeDeg } from './astro';
import { computeScore, WEIGHTS, type Weights } from './score';

/**
 * SCORE VALIDATION & BACKTESTING (pure).
 *  - parseOmni2: NASA/GSFC OMNI2 hourly low-res data (real historical Kp, Bz GSM, speed, density)
 *  - selectNights: pick storm & quiet nights from the data itself (no hand-picked dates)
 *  - backtestNight: peak score in the dark hours of a night at a place
 *  - calibration: predicted score bucket vs. observed "saw it" rate + Brier score
 */

export interface OmniHour {
  time: string;
  kp: number | null;
  bz: number | null;
  speed: number | null;
  density: number | null;
}

/**
 * OMNI2 columns (1-based, whitespace separated): 1 year, 2 day-of-year, 3 hour, 17 Bz GSM (nT, fill 999.9),
 * 24 proton density (fill 999.9), 25 flow speed (km/s, fill 9999.), 39 Kp×10 (fill 99).
 * https://omniweb.gsfc.nasa.gov/html/ow_data.html#3
 */
export function parseOmni2(text: string): OmniHour[] {
  const out: OmniHour[] = [];
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 39) continue;
    const [y, doy, h] = [Number(f[0]), Number(f[1]), Number(f[2])];
    if (!Number.isFinite(y) || !Number.isFinite(doy) || !Number.isFinite(h)) continue;
    const t = new Date(Date.UTC(y, 0, 1, h) + (doy - 1) * 864e5);
    const num = (i: number, fill: number) => {
      const v = Number(f[i - 1]);
      return Number.isFinite(v) && Math.abs(v) < fill ? v : null;
    };
    const kp10 = num(39, 99);
    out.push({ time: t.toISOString(), kp: kp10 === null ? null : kp10 / 10, bz: num(17, 999), speed: num(25, 9999), density: num(24, 999) });
  }
  return out;
}

export interface NightPick {
  /** evening date (UTC), the night runs 18:00 → 06:00 UTC */
  date: string;
  maxKp: number;
  kind: 'storm' | 'quiet';
}

/** Nights in the dark season (Sep–Apr) with max Kp ≥ stormKp, and an equal number of quiet nights (max Kp ≤ quietKp). */
export function selectNights(hours: OmniHour[], opts = { stormKp: 7, quietKp: 2, max: 10 }): NightPick[] {
  const byNight = new Map<string, number>();
  for (const h of hours) {
    if (h.kp === null) continue;
    const t = new Date(h.time);
    const hr = t.getUTCHours();
    if (hr >= 6 && hr < 18) continue;
    const evening = new Date(t.getTime() - (hr < 6 ? 864e5 : 0)).toISOString().slice(0, 10);
    const m = Number(evening.slice(5, 7));
    if (m > 4 && m < 9) continue; // light summer nights in Iceland
    byNight.set(evening, Math.max(byNight.get(evening) ?? 0, h.kp));
  }
  const all = [...byNight.entries()].map(([date, maxKp]) => ({ date, maxKp }));
  const storms = all.filter((n) => n.maxKp >= opts.stormKp).sort((a, b) => b.maxKp - a.maxKp).slice(0, opts.max);
  // deterministic quiet sample: evenly spaced through the sorted quiet list
  const quietAll = all.filter((n) => n.maxKp <= opts.quietKp).sort((a, b) => a.date.localeCompare(b.date));
  const step = Math.max(1, Math.floor(quietAll.length / Math.max(1, storms.length)));
  const quiet = quietAll.filter((_, i) => i % step === 0).slice(0, storms.length);
  return [...storms.map((n) => ({ ...n, kind: 'storm' as const })), ...quiet.map((n) => ({ ...n, kind: 'quiet' as const }))];
}

export interface BacktestResult {
  date: string;
  kind: 'storm' | 'quiet';
  place: string;
  maxKp: number;
  /** peak score with cloud data (null if no cloud history was available) */
  peakScore: number | null;
  /** peak score assuming a clear sky (isolates the space-weather + darkness + moon part) */
  peakClearSky: number;
  peakAt: string;
  meanCloud: number | null;
}

/** Score every dark hour (18–06 UTC) of a night at a place; space weather from OMNI2, cloud optional. */
export function backtestNight(
  night: NightPick,
  place: { name: string; lat: number; lon: number },
  omni: OmniHour[],
  cloudByHour: Map<string, number> | null,
  W: Weights = WEIGHTS,
): BacktestResult {
  const start = Date.parse(`${night.date}T18:00:00Z`);
  let peak = -1;
  let peakClear = -1;
  let peakAt = '';
  const clouds: number[] = [];
  const omniByTime = new Map(omni.map((h) => [h.time, h]));
  // 18:00–05:00 UTC inclusive — the same window selectNights uses (06:00 belongs to the next Kp slot/morning)
  for (let i = 0; i < 12; i++) {
    const t = new Date(start + i * 3.6e6);
    const iso = t.toISOString();
    const sw = omniByTime.get(iso);
    if (!sw) continue;
    const sunAlt = sunAltitudeDeg(t, place.lat, place.lon);
    if (darknessFactor(sunAlt) < 0.2) continue;
    const m = moonState(t, place.lat, place.lon);
    const base = { sunAltDeg: sunAlt, moonAltDeg: m.altitudeDeg, moonIllumination: m.illumination, ovation: null, kp: sw.kp, bz: sw.bz, speed: sw.speed };
    const clear = computeScore({ ...base, cloud: 0 }, W).score;
    const cloud = cloudByHour?.get(iso.slice(0, 13)) ?? null;
    if (cloud !== null) clouds.push(cloud);
    const withCloud = cloud === null ? null : computeScore({ ...base, cloud }, W).score;
    if (clear > peakClear) peakClear = clear;
    const s = withCloud ?? -1;
    if (s > peak) {
      peak = s;
      peakAt = iso;
    }
    if (peakAt === '' && clear === peakClear) peakAt = iso;
  }
  return {
    date: night.date,
    kind: night.kind,
    place: place.name,
    maxKp: night.maxKp,
    peakScore: peak >= 0 ? peak : null,
    peakClearSky: Math.max(0, peakClear),
    peakAt,
    meanCloud: clouds.length ? Math.round(clouds.reduce((a, b) => a + b, 0) / clouds.length) : null,
  };
}

export interface Outcome {
  predicted: number; // 0–100 score
  saw: boolean;
}

export interface Calibration {
  n: number;
  /** mean squared error of score/100 as a probability vs. outcome (lower is better; 0.25 = coin flip) */
  brier: number | null;
  buckets: { range: string; n: number; sawRate: number | null; meanScore: number | null }[];
}

export const BUCKETS: [number, number][] = [
  [0, 10],
  [10, 30],
  [30, 50],
  [50, 70],
  [70, 101],
];

export function calibration(outcomes: Outcome[]): Calibration {
  const n = outcomes.length;
  const brier = n ? outcomes.reduce((s, o) => s + (o.predicted / 100 - (o.saw ? 1 : 0)) ** 2, 0) / n : null;
  const buckets = BUCKETS.map(([lo, hi]) => {
    const inB = outcomes.filter((o) => o.predicted >= lo && o.predicted < hi);
    return {
      range: `${lo}–${Math.min(hi, 100)}`,
      n: inB.length,
      sawRate: inB.length ? Math.round((inB.filter((o) => o.saw).length / inB.length) * 100) / 100 : null,
      meanScore: inB.length ? Math.round(inB.reduce((s, o) => s + o.predicted, 0) / inB.length) : null,
    };
  });
  return { n, brier: brier === null ? null : Math.round(brier * 1000) / 1000, buckets };
}

/** Night key for an instant: evenings and the small hours belong to the evening's date (UTC). */
export function eveningOf(iso: string): string {
  const t = new Date(iso);
  return new Date(t.getTime() - (t.getUTCHours() < 12 ? 864e5 : 0)).toISOString().slice(0, 10);
}

/** Freshness classification shared by server health and the app's stale banner. */
export type Freshness = 'live' | 'stale' | 'expired' | 'unknown';
export function freshness(fetchedAt: string | null | undefined, ttlSec: number, now = new Date()): { state: Freshness; ageMin: number | null } {
  if (!fetchedAt) return { state: 'unknown', ageMin: null };
  const ageSec = (now.getTime() - new Date(fetchedAt).getTime()) / 1000;
  const ageMin = Math.max(0, Math.round(ageSec / 60));
  if (ageSec <= ttlSec * 2) return { state: 'live', ageMin };
  if (ageSec <= Math.max(ttlSec * 12, 3 * 3600)) return { state: 'stale', ageMin };
  return { state: 'expired', ageMin };
}
