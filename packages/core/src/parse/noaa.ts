import type { ImfPoint, KpPoint, SolarWindPoint } from '../types';
import { isRecord, isoUtc, num, ParseError } from './util';

/**
 * NOAA SWPC parsers.
 *
 * Verified 2026-11-02:
 *  - products/noaa-planetary-k-index.json → array of objects {time_tag, Kp, a_running, station_count}
 *    (older format was an array of arrays with a header row — still accepted below).
 *  - products/noaa-planetary-k-index-forecast.json → array of objects {time_tag, kp, observed, noaa_scale}
 *  - json/rtsw/rtsw_wind_1m.json, rtsw_mag_1m.json → newest-first, multiple spacecraft
 *    (ACE, IMAP, SOLAR1) with an `active` flag marking the operational source.
 *  - products/solar-wind/*.json → REMOVED (404). Do not use.
 */

/** Convert legacy array-of-arrays (first row = header) into objects. */
function tableToObjects(data: unknown[]): Record<string, unknown>[] {
  const [header, ...rows] = data as unknown[][];
  if (!Array.isArray(header)) return [];
  return rows.filter(Array.isArray).map((r) => Object.fromEntries(header.map((h, i) => [String(h), r[i]])));
}

function asObjects(data: unknown, source: string): Record<string, unknown>[] {
  if (!Array.isArray(data)) throw new ParseError(source, 'expected array');
  if (data.length && Array.isArray(data[0])) return tableToObjects(data);
  return data.filter(isRecord);
}

/** Observed planetary Kp (3-hourly), oldest first. */
export function parseKpObserved(data: unknown): KpPoint[] {
  const out: KpPoint[] = [];
  for (const r of asObjects(data, 'noaa-kp')) {
    const time = isoUtc(r.time_tag);
    const kp = num(r.Kp ?? r.kp);
    if (time && kp !== null) out.push({ time, kp, kind: 'observed', scale: null });
  }
  if (!out.length) throw new ParseError('noaa-kp', 'no rows');
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/** Kp observed + estimated + 3-day predicted, oldest first. */
export function parseKpForecast(data: unknown): KpPoint[] {
  const out: KpPoint[] = [];
  for (const r of asObjects(data, 'noaa-kp-forecast')) {
    const time = isoUtc(r.time_tag);
    const kp = num(r.kp ?? r.Kp);
    const k = String(r.observed ?? '').toLowerCase();
    const kind: KpPoint['kind'] = k === 'observed' ? 'observed' : k === 'estimated' ? 'estimated' : 'predicted';
    const scale = typeof r.noaa_scale === 'string' && r.noaa_scale ? r.noaa_scale : null;
    if (time && kp !== null) out.push({ time, kp, kind, scale });
  }
  if (!out.length) throw new ParseError('noaa-kp-forecast', 'no rows');
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * RTSW feeds contain records from several spacecraft. Prefer the one flagged active;
 * if none is flagged within the data, fall back to all records (newest wins).
 */
function pickActive(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; source: string | null } {
  const active = rows.filter((r) => r.active === true);
  if (active.length) {
    // Use the source of the newest active record, to avoid mixing spacecraft.
    const newest = active.reduce((a, b) => (String(a.time_tag) > String(b.time_tag) ? a : b));
    const src = typeof newest.source === 'string' ? newest.source : null;
    return { rows: src ? active.filter((r) => r.source === src) : active, source: src };
  }
  return { rows, source: null };
}

export interface RtswResult<T> {
  /** Spacecraft providing the data (e.g. "SOLAR1", "IMAP", "ACE"), null if unknown. */
  spacecraft: string | null;
  series: T[];
}

export function parseRtswWind(data: unknown): RtswResult<SolarWindPoint> {
  const { rows, source } = pickActive(asObjects(data, 'rtsw-wind'));
  const series: SolarWindPoint[] = [];
  for (const r of rows) {
    const time = isoUtc(r.time_tag);
    if (!time) continue;
    const speed = num(r.proton_speed);
    const density = num(r.proton_density);
    if (speed === null && density === null) continue;
    series.push({ time, speed, density });
  }
  if (!series.length) throw new ParseError('rtsw-wind', 'no usable rows');
  series.sort((a, b) => a.time.localeCompare(b.time));
  return { spacecraft: source, series };
}

export function parseRtswMag(data: unknown): RtswResult<ImfPoint> {
  const { rows, source } = pickActive(asObjects(data, 'rtsw-mag'));
  const series: ImfPoint[] = [];
  for (const r of rows) {
    const time = isoUtc(r.time_tag);
    if (!time) continue;
    const bt = num(r.bt);
    const bz = num(r.bz_gsm);
    if (bt === null && bz === null) continue;
    series.push({ time, bt, bz });
  }
  if (!series.length) throw new ParseError('rtsw-mag', 'no usable rows');
  series.sort((a, b) => a.time.localeCompare(b.time));
  return { spacecraft: source, series };
}

/** NOAA G-scale from Kp: G1 = Kp5 … G5 = Kp9. */
export function kpToGScale(kp: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (kp >= 9) return 5;
  if (kp >= 8) return 4;
  if (kp >= 7) return 3;
  if (kp >= 6) return 2;
  if (kp >= 5) return 1;
  return 0;
}

/** Latest point at or before `now`, else null. Input must be sorted oldest-first. */
export function latestAtOrBefore<T extends { time: string }>(series: T[], now: Date): T | null {
  const iso = now.toISOString();
  let best: T | null = null;
  for (const p of series) {
    if (p.time <= iso) best = p;
    else break;
  }
  return best;
}

/** Keep only points within the last `minutes` before the newest point. */
export function lastMinutes<T extends { time: string }>(series: T[], minutes: number): T[] {
  if (!series.length) return [];
  const end = new Date(series[series.length - 1]!.time).getTime();
  const cutoff = end - minutes * 60_000;
  return series.filter((p) => new Date(p.time).getTime() >= cutoff);
}

/** Downsample by averaging into buckets of `bucketMin` minutes (numeric fields only). */
export function bucketAverage<T extends { time: string }>(series: T[], bucketMin: number, keys: (keyof T)[]): T[] {
  const buckets = new Map<number, T[]>();
  const size = bucketMin * 60_000;
  for (const p of series) {
    const k = Math.floor(new Date(p.time).getTime() / size) * size;
    const arr = buckets.get(k);
    if (arr) arr.push(p);
    else buckets.set(k, [p]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, pts]) => {
      const o: Record<string, unknown> = { time: new Date(k).toISOString() };
      for (const key of keys) {
        const vals = pts.map((p) => p[key]).filter((v): v is T[keyof T] & number => typeof v === 'number');
        o[key as string] = vals.length ? Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2)) : null;
      }
      return o as T;
    });
}
