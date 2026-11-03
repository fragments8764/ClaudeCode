import { sunAltitudeDeg } from './astro';
import { isRecord, isoUtc, num, ParseError } from './parse/util';
import { effectiveCloud } from './parse/clouds';

/**
 * Regular lat/lon grid of hourly values (e.g. effective cloud %) for map layers and the
 * best-spot finder. values[timeIndex][latIndex * lons.length + lonIndex]
 */
export interface ValueGrid {
  lats: number[]; // ascending
  lons: number[]; // ascending
  times: string[];
  values: (number | null)[][];
}

/** Iceland cloud grid: 0.5° lat × 1° lon (9 × 13 = 117 points), one Open-Meteo request. */
export const ICELAND_GRID = {
  lats: [63.0, 63.5, 64.0, 64.5, 65.0, 65.5, 66.0, 66.5, 67.0],
  lons: [-25, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13],
};

/**
 * Parse an Open-Meteo multi-location response (array, one entry per point, same order as
 * requested: lat-major) into a ValueGrid of effective cloud cover.
 */
export function parseOpenMeteoGrid(data: unknown, lats: number[], lons: number[]): ValueGrid {
  if (!Array.isArray(data) || data.length !== lats.length * lons.length) throw new ParseError('open-meteo-grid', `expected ${lats.length * lons.length} points`);
  let times: string[] | null = null;
  const perPoint: (number | null)[][] = [];
  for (const p of data) {
    if (!isRecord(p) || !isRecord(p.hourly) || !Array.isArray(p.hourly.time)) throw new ParseError('open-meteo-grid', 'bad point');
    const h = p.hourly as Record<string, unknown[]>;
    if (!times) times = h.time!.map((t) => isoUtc(t) ?? '');
    const at = (k: string, i: number) => num(Array.isArray(h[k]) ? h[k]![i] : null);
    perPoint.push(
      h.time!.map((_, i) => effectiveCloud({ total: at('cloud_cover', i), low: at('cloud_cover_low', i), mid: at('cloud_cover_mid', i), high: at('cloud_cover_high', i) })),
    );
  }
  const T = times ?? [];
  return { lats, lons, times: T, values: T.map((_, ti) => perPoint.map((pp) => pp[ti] ?? null)) };
}

/** Index of the hour slot nearest to `t` (clamped). */
export function timeIndex(grid: Pick<ValueGrid, 'times'>, t: Date): number {
  let best = 0;
  let d = Infinity;
  grid.times.forEach((iso, i) => {
    const x = Math.abs(new Date(iso).getTime() - t.getTime());
    if (x < d) {
      d = x;
      best = i;
    }
  });
  return best;
}

/** Bilinear interpolation inside the grid; null outside it or when corners are missing. */
export function gridValueAt(grid: ValueGrid, ti: number, lat: number, lon: number): number | null {
  const { lats, lons } = grid;
  const row = grid.values[ti];
  if (!row) return null;
  if (lat < lats[0]! || lat > lats[lats.length - 1]! || lon < lons[0]! || lon > lons[lons.length - 1]!) return null;
  const fi = (arr: number[], v: number) => {
    let i = 0;
    while (i < arr.length - 2 && v > arr[i + 1]!) i++;
    return [i, (v - arr[i]!) / (arr[i + 1]! - arr[i]!)] as const;
  };
  const [i, fy] = fi(lats, lat);
  const [j, fx] = fi(lons, lon);
  const W = lons.length;
  const v = (a: number, b: number) => row[a * W + b];
  const q = [v(i, j), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1)];
  if (q.some((x) => x == null)) {
    const ok = q.filter((x): x is number => x != null);
    return ok.length ? ok.reduce((s, x) => s + x, 0) / ok.length : null;
  }
  const [a, b, c, d] = q as number[];
  return (a! * (1 - fx) + b! * fx) * (1 - fy) + (c! * (1 - fx) + d! * fx) * fy;
}

/**
 * Night-side polygon (sun below `altDeg`) as GeoJSON-style ring [[lon,lat],...], clipped to ±85°.
 * Robust brute-force: per longitude, scan latitude from the dark pole until the sun rises above altDeg.
 */
export function nightPolygon(date: Date, altDeg = -12, stepLon = 2, stepLat = 0.5): [number, number][] | null {
  // Which pole is darker? Compare altitude at both poles at lon 0.
  const darkNorth = sunAltitudeDeg(date, 85, 0) < sunAltitudeDeg(date, -85, 0);
  const pole = darkNorth ? 85 : -85;
  const dir = darkNorth ? -1 : 1;
  const edge: [number, number][] = [];
  let anyDark = false;
  for (let lon = -180; lon <= 180; lon += stepLon) {
    let lat = pole;
    if (sunAltitudeDeg(date, lat, lon) >= altDeg) {
      edge.push([lon, pole]);
      continue;
    }
    anyDark = true;
    while (Math.abs(lat) <= 85 && sunAltitudeDeg(date, lat + dir * stepLat, lon) < altDeg) lat += dir * stepLat;
    edge.push([lon, Math.max(-85, Math.min(85, lat))]);
  }
  if (!anyDark) return null;
  return [...edge, [180, pole], [-180, pole], edge[0]!];
}
