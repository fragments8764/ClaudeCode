import { haversineKm } from './geo';
import type { LatLon } from './types';

const R = 6371;

/** Initial great-circle bearing a → b, degrees from north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return ((Math.atan2(y, x) / r) % 360 + 360) % 360;
}

/**
 * Elevation angle above the horizon of aurora at `altKm` (≈110 km for the bright lower edge)
 * whose foot point is `distanceKm` away along the ground. Accounts for Earth's curvature.
 */
export function auroraElevationDeg(distanceKm: number, altKm = 110): number {
  if (distanceKm <= 0.001) return 90;
  const th = distanceKm / R;
  const el = Math.atan((Math.cos(th) - R / (R + altKm)) / Math.sin(th));
  return (el * 180) / Math.PI;
}

/** Ground distance at which aurora at `altKm` sits right on the horizon (0°). */
export function auroraHorizonKm(altKm = 110): number {
  return R * Math.acos(R / (R + altKm));
}

export interface ArcPrediction {
  /** Bearing to the nearest point of the oval meeting `threshold`. */
  bearingDeg: number;
  distanceKm: number;
  elevationDeg: number;
  overhead: boolean;
}

/**
 * Where to look: nearest grid point with value ≥ threshold (e.g. OVATION ≥ 10).
 * `points` is a flat list of [lat, lon, value].
 */
export function predictArc(from: LatLon, points: [number, number, number][], threshold = 10): ArcPrediction | null {
  let best: [number, number, number] | null = null;
  let bestD = Infinity;
  for (const p of points) {
    if (p[2] < threshold) continue;
    const d = haversineKm(from, { lat: p[0], lon: p[1] });
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (!best) return null;
  const overhead = bestD < 60;
  return {
    bearingDeg: overhead ? 0 : bearingDeg(from, { lat: best[0], lon: best[1] }),
    distanceKm: Math.round(bestD),
    elevationDeg: Math.round(auroraElevationDeg(bestD) * 10) / 10,
    overhead,
  };
}
