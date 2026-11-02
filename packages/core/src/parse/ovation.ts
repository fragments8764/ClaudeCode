import { haversineKm } from '../geo';
import { isRecord, isoUtc, num, ParseError } from './util';

/**
 * NOAA OVATION Prime 30-minute aurora forecast.
 * Verified 2026-11-02: json/ovation_aurora_latest.json →
 *   { "Observation Time", "Forecast Time", "Data Format": "[Longitude, Latitude, Aurora]",
 *     coordinates: [[lon 0..359, lat -90..90, value 0..100], ...] }  (1° grid, 65 160 points, ~900 KB)
 * Values are a probability-like intensity of aurora overhead.
 */
export interface OvationGrid {
  observationTime: string | null;
  forecastTime: string | null;
  /** value[latIndex][lonIndex], lat -90..90 → index 0..180, lon 0..359 → 0..359. */
  values: Uint8Array;
}

const LATS = 181;
const LONS = 360;
const idx = (lat: number, lon: number) => (lat + 90) * LONS + lon;

export function parseOvation(data: unknown): OvationGrid {
  if (!isRecord(data) || !Array.isArray(data.coordinates)) throw new ParseError('ovation', 'unexpected shape');
  const values = new Uint8Array(LATS * LONS);
  let n = 0;
  for (const c of data.coordinates) {
    if (!Array.isArray(c)) continue;
    const lon = num(c[0]);
    const lat = num(c[1]);
    const v = num(c[2]);
    if (lon === null || lat === null || v === null) continue;
    const lo = Math.round(lon);
    const la = Math.round(lat);
    if (lo < 0 || lo >= LONS || la < -90 || la > 90) continue;
    values[idx(la, lo)] = Math.max(0, Math.min(100, Math.round(v)));
    n++;
  }
  if (n < 1000) throw new ParseError('ovation', `only ${n} grid points`);
  return {
    observationTime: isoUtc(data['Observation Time']),
    forecastTime: isoUtc(data['Forecast Time']),
    values,
  };
}

export function ovationValue(grid: OvationGrid, lat: number, lon: number): number {
  const la = Math.max(-90, Math.min(90, Math.round(lat)));
  const lo = ((Math.round(lon) % 360) + 360) % 360;
  return grid.values[idx(la, lo)]!;
}

/**
 * Aurora sits ~100–250 km up, so you can see it well beyond the point overhead.
 * At 110 km altitude it clears ~10° elevation out to ~500 km; it is still visible
 * low on the horizon out to ~800 km.
 */
export const OVATION_VIEW_KM = 800;

export interface OvationAtLocation {
  /** Value directly overhead (0–100). */
  overhead: number;
  /** Strongest distance-weighted value within view (0–100) — what you could see on the horizon. */
  visible: number;
  /** Bearing-ish hint: latitude of the strongest visible point. */
  peakLat: number;
  peakLon: number;
  forecastTime: string | null;
}

/**
 * Overhead value plus the best distance-weighted value within OVATION_VIEW_KM.
 * Weight falls linearly from 1 (overhead) to 0.2 at the view limit, because distant
 * aurora is lower on the horizon and dimmer.
 */
export function ovationAt(grid: OvationGrid, lat: number, lon: number): OvationAtLocation {
  const overhead = ovationValue(grid, lat, lon);
  let visible = overhead;
  let peakLat = lat;
  let peakLon = lon;
  const dLat = Math.ceil(OVATION_VIEW_KM / 111);
  for (let la = Math.round(lat) - dLat; la <= Math.round(lat) + dLat; la++) {
    if (la < -90 || la > 90) continue;
    const kmPerLon = 111 * Math.max(0.05, Math.cos((la * Math.PI) / 180));
    const dLon = Math.min(180, Math.ceil(OVATION_VIEW_KM / kmPerLon));
    for (let lo = Math.round(lon) - dLon; lo <= Math.round(lon) + dLon; lo++) {
      const v = ovationValue(grid, la, lo);
      if (v <= visible) continue;
      const d = haversineKm({ lat, lon }, { lat: la, lon: ((lo + 540) % 360) - 180 });
      if (d > OVATION_VIEW_KM) continue;
      const w = 1 - 0.8 * (d / OVATION_VIEW_KM);
      const wv = v * w;
      if (wv > visible) {
        visible = Math.round(wv);
        peakLat = la;
        peakLon = ((lo + 540) % 360) - 180;
      }
    }
  }
  return { overhead, visible, peakLat, peakLon, forecastTime: grid.forecastTime };
}
