import { darknessFactor, moonState, sunAltitudeDeg } from './astro';
import { haversineKm } from './geo';
import { gridValueAt, type ValueGrid } from './grid';
import { computeScore, WEIGHTS, type Weights } from './score';
import type { LatLon } from './types';

/** Curated dark-sky spot (config/spots.json). */
export interface Spot extends LatLon {
  id: string;
  name: string;
  region: string;
  /** Approximate Bortle class 1 (pristine) – 9 (city). */
  bortle: number;
  /** Compass direction with the best open view (e.g. "N", "NE–NW"). */
  view: string;
  parking: string;
  shelter: string;
  notes: string;
  /** Seasonal / F-road / 4x4 caveats. */
  access?: string;
}

/** Penalty for artificial light: Bortle 1–2 → 1.0, 4 → 0.85, 6 → 0.65, 8+ → 0.45. */
export function lightPollutionFactor(bortle: number): number {
  return Math.max(0.45, Math.min(1, 1 - (bortle - 2) * 0.08));
}

/** Rough drive time: great-circle × 1.35 road factor at 70 km/h average (winter Iceland). */
export function driveMinutes(km: number): number {
  return Math.round(((km * 1.35) / 70) * 60);
}

export interface RankedSpot {
  spot: Spot;
  distanceKm: number;
  driveMin: number;
  cloud: number | null;
  score: number;
  clearAndDark: boolean;
}

export interface RankContext {
  from: LatLon;
  at: Date;
  clouds: ValueGrid | null;
  timeIdx: number;
  /** OVATION visible value near Iceland (shared, it varies slowly over a few hundred km). */
  ovation: number | null;
  kp: number | null;
  bz: number | null;
  speed: number | null;
  maxKm: number;
  weights?: Weights;
  /** personalisation: skip spots beyond this drive time */
  maxDriveMin?: number;
  /** personalisation: small boost for favourite spots */
  favorites?: string[];
}

/** Score every spot for time `at` and rank, best first. Spots beyond maxKm are excluded. */
export function rankSpots(spots: Spot[], ctx: RankContext): RankedSpot[] {
  const moon = moonState(ctx.at, ctx.from.lat, ctx.from.lon);
  const out: RankedSpot[] = [];
  for (const spot of spots) {
    const distanceKm = haversineKm(ctx.from, spot);
    if (distanceKm > ctx.maxKm) continue;
    if (ctx.maxDriveMin != null && driveMinutes(distanceKm) > ctx.maxDriveMin) continue;
    const cloud = ctx.clouds ? gridValueAt(ctx.clouds, ctx.timeIdx, spot.lat, spot.lon) : null;
    const sunAlt = sunAltitudeDeg(ctx.at, spot.lat, spot.lon);
    const r = computeScore({
      sunAltDeg: sunAlt,
      moonAltDeg: moon.altitudeDeg,
      moonIllumination: moon.illumination,
      cloud,
      ovation: ctx.ovation,
      kp: ctx.kp,
      bz: ctx.bz,
      speed: ctx.speed,
    }, ctx.weights ?? WEIGHTS);
    const score = Math.round(r.score * lightPollutionFactor(spot.bortle));
    out.push({
      spot,
      distanceKm: Math.round(distanceKm),
      driveMin: driveMinutes(distanceKm),
      cloud: cloud == null ? null : Math.round(cloud),
      score,
      clearAndDark: cloud != null && cloud <= 30 && darknessFactor(sunAlt) >= 0.6,
    });
  }
  // Prefer score; break ties by distance (closer is better).
  // Favourites win ties and near-ties (≤ 3 points); otherwise score, then distance.
  const fav = new Set(ctx.favorites ?? []);
  const eff = (r: RankedSpot) => r.score + (fav.has(r.spot.id) ? 3 : 0);
  return out.sort((a, b) => eff(b) - eff(a) || a.distanceKm - b.distanceKm);
}

export function mapsLinks(dest: LatLon, label: string) {
  const ll = `${dest.lat.toFixed(5)},${dest.lon.toFixed(5)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    apple: `https://maps.apple.com/?daddr=${ll}&dirflg=d&q=${encodeURIComponent(label)}`,
    geo: `geo:${ll}?q=${ll}(${encodeURIComponent(label)})`,
  };
}
