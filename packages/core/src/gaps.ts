import { darknessFactor, moonState, sunAltitudeDeg } from './astro';
import { haversineKm } from './geo';
import { gridValueAt, timeIndex, type ValueGrid } from './grid';
import { driveMinutes, lightPollutionFactor, type Spot } from './spots';
import type { LatLon } from './types';

/**
 * CLOUD-GAP HUNTER: where is the nearest clear, dark sky I can actually reach in time?
 * For each candidate spot: drive there, then find the first hour after arrival that is dark
 * enough and ≤ 30 % effective cloud; measure how long the gap lasts and how sure we are.
 */
export interface Gap {
  spot: Spot;
  distanceKm: number;
  driveMin: number;
  /** when the sky clears at the spot (≥ now) */
  clearAt: string;
  /** when you can be there (≥ clearAt) */
  arriveAt: string;
  /** end of the clear & dark window */
  clearUntil: string;
  /** when to leave (≥ now) */
  leaveAt: string;
  leaveInMin: number;
  /** return home estimate: end of window + drive */
  backAt: string;
  cloud: number;
  hours: number;
  confidence: 'high' | 'medium' | 'low';
  /** one-line summary, e.g. "Clearing near Vík at 23:10. 1h 40m drive. Leave in 20 min." */
  summary: string;
}

export interface GapOptions {
  from: LatLon;
  now: Date;
  grid: ValueGrid;
  spots: Spot[];
  maxDriveMin?: number;
  /** darkness factor required (0.65 ≈ sun −12°, 1 = −18°) */
  minDark?: number;
  /** look-ahead in hours */
  horizonH?: number;
  clearMax?: number;
  fmt?: (iso: string) => string;
}

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`);
const defaultFmt = (iso: string) => iso.slice(11, 16);

export function findCloudGaps(o: GapOptions): Gap[] {
  const { from, now, grid, spots } = o;
  const maxDrive = o.maxDriveMin ?? 180;
  const minDark = o.minDark ?? 0.6;
  const horizon = o.horizonH ?? 14;
  const clearMax = o.clearMax ?? 30;
  const fmt = o.fmt ?? defaultFmt;
  const nowMs = now.getTime();
  const out: Gap[] = [];

  for (const spot of spots) {
    const distanceKm = Math.round(haversineKm(from, spot));
    const drive = driveMinutes(distanceKm);
    if (drive > maxDrive) continue;
    const arrive = nowMs + drive * 60_000;
    // contiguous clear-and-dark windows from now on; take the first that's still open ≥ 30 min after you arrive
    let start: number | null = null;
    let end: number | null = null;
    let cloudAtStart = 0;
    let curStart: number | null = null;
    let curCloud = 0;
    const hour0 = Math.floor(nowMs / 3.6e6) * 3.6e6;
    for (let t = hour0; t <= nowMs + horizon * 3.6e6 + 3.6e6; t += 3.6e6) {
      const d = new Date(t);
      const dark = darknessFactor(sunAltitudeDeg(d, spot.lat, spot.lon));
      const cloud = gridValueAt(grid, timeIndex(grid, d), spot.lat, spot.lon);
      const ok = t <= nowMs + horizon * 3.6e6 && dark >= minDark && cloud != null && cloud <= clearMax;
      if (ok && curStart === null) {
        curStart = t;
        curCloud = cloud!;
      }
      if (!ok && curStart !== null) {
        if (t >= arrive + 30 * 60_000) {
          start = curStart;
          end = t;
          cloudAtStart = curCloud;
          break;
        }
        curStart = null;
      }
    }
    if (start === null || end === null) continue;
    const arriveAt = Math.max(arrive, start);
    const hours = Math.round((end - arriveAt) / 3.6e6);
    // confidence: long window, very clear, and clear around it (the grid is coarse)
    const around = [-0.5, 0.5].flatMap((dl) => [-1, 1].map((dn) => gridValueAt(grid, timeIndex(grid, new Date(start!)), spot.lat + dl, spot.lon + dn))).filter((x): x is number => x != null);
    const neighbourhood = around.length ? around.reduce((a, b) => a + b, 0) / around.length : 50;
    const confidence: Gap['confidence'] = hours >= 2 && cloudAtStart <= 15 && neighbourhood <= 40 ? 'high' : hours >= 2 || cloudAtStart <= 15 ? 'medium' : 'low';
    const leaveAt = Math.max(nowMs, start - drive * 60_000);
    const leaveIn = Math.round((leaveAt - nowMs) / 60_000);
    const clearAtIso = new Date(Math.max(start, nowMs)).toISOString();
    out.push({
      spot,
      distanceKm,
      driveMin: drive,
      clearAt: clearAtIso,
      arriveAt: new Date(arriveAt).toISOString(),
      clearUntil: new Date(end).toISOString(),
      leaveAt: new Date(leaveAt).toISOString(),
      leaveInMin: leaveIn,
      backAt: new Date(end + drive * 60_000).toISOString(),
      cloud: Math.round(cloudAtStart),
      hours,
      confidence,
      summary: `${start <= nowMs ? `Clear near ${spot.name} now` : `Clearing near ${spot.name} at ${fmt(clearAtIso)}`}. ${hm(drive)} drive. ${leaveIn <= 5 ? 'Leave now.' : `Leave in ${hm(leaveIn)}.`}`,
    });
  }
  // earliest clear arrival first, then shorter drive, then darker spot
  const rank = (g: Gap) => new Date(g.arriveAt).getTime() + g.driveMin * 60_000 * 0.5 - lightPollutionFactor(g.spot.bortle) * 600_000;
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Moon brightness impact during a window (0 none … 1 full moon high all night). */
export function moonImpact(fromIso: string, toIso: string, lat: number, lon: number): number {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (!(b > a)) return 0;
  let sum = 0;
  let n = 0;
  for (let t = a; t <= b; t += 30 * 60_000) {
    const m = moonState(new Date(t), lat, lon);
    sum += m.altitudeDeg > 0 ? m.illumination * Math.min(1, m.altitudeDeg / 30) : 0;
    n++;
  }
  return n ? sum / n : 0;
}
