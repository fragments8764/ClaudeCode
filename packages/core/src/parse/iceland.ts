import { haversineKm } from '../geo';
import type { LatLon } from '../types';
import { isRecord, isoUtc, num } from './util';

/**
 * Icelandic sources.
 * Verified 2026-11-03:
 *  - IMO CAP: https://api.vedur.is/cap/capbroker/active/detailed/all → [] or 204 when none active.
 *  - IMO ceilometer obs: https://api.vedur.is/weather/observations/aws/raw/cloud/1min/latest
 *    → [{station, time, n1 (oktas, lowest layer), h1 (base m), cl_base ...}], stations at /weather/stations
 *  - Vegagerðin road weather: https://gagnaveita.vegagerdin.is/api/vedur2014_1 (Nafn, Breidd, Lengd, Vindhradi, Vindhvida, Hiti, Veghiti, IdButur1)
 *  - Vegagerðin road conditions: https://gagnaveita.vegagerdin.is/api/faerd2017_1 (IdButur, StuttNafnButs, AstandLysingEn …)
 */

export interface Warning {
  id: string;
  headline: string;
  description: string;
  event: string;
  severity: string;
  onset: string | null;
  expires: string | null;
  /** [lat, lon] ring if provided */
  polygon: [number, number][] | null;
  area: string;
}

export function parseCapWarnings(data: unknown): Warning[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isRecord).map((m) => {
    let polygon: [number, number][] | null = null;
    if (Array.isArray(m.polygon)) {
      const flat = m.polygon.flat(3).map(num).filter((x): x is number => x !== null);
      if (flat.length >= 6) {
        polygon = [];
        for (let i = 0; i + 1 < flat.length; i += 2) polygon.push([flat[i]!, flat[i + 1]!]);
      }
    } else if (typeof m.polygon === 'string') {
      polygon = m.polygon
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number) as [number, number])
        .filter((p) => p.length === 2 && p.every(Number.isFinite));
    }
    const geocode = isRecord(m.geocode_en) ? Object.values(m.geocode_en).filter((x) => typeof x === 'string').join(', ') : '';
    return {
      id: String(m.identifier ?? Math.random()),
      headline: String(m.headline_en ?? m.headline_is ?? 'Weather warning'),
      description: String(m.description_en ?? m.description_is ?? ''),
      event: String(m.event_en ?? m.event_is ?? ''),
      severity: String(m.severity ?? 'Unknown'),
      onset: isoUtc(m.onset),
      expires: isoUtc(m.expires),
      polygon,
      area: geocode,
    };
  });
}

/** Ray-casting point-in-polygon, polygon given as [lat, lon]. */
export function pointInPolygon(p: LatLon, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]!;
    const [yj, xj] = poly[j]!;
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface RoadStation extends LatLon {
  id: number;
  name: string;
  time: string | null;
  windMs: number | null;
  gustMs: number | null;
  airC: number | null;
  roadC: number | null;
  segmentIds: number[];
}

/** Vegagerðin "Dags" is "3.11.2026 09:00:00" Icelandic local time = UTC. */
function parseIsDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{2}):(\d{2})/);
  if (!m) return isoUtc(v);
  return new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!)).toISOString();
}

export function parseRoadStations(data: unknown): RoadStation[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isRecord).flatMap((r) => {
    const lat = num(r.Breidd);
    const lon = num(r.Lengd);
    if (lat === null || lon === null) return [];
    return [{
      id: Number(r.Nr),
      name: String(r.Nafn ?? ''),
      lat,
      lon,
      time: parseIsDate(r.Dags),
      windMs: num(r.Vindhradi),
      gustMs: num(r.Vindhvida),
      airC: num(r.Hiti),
      roadC: num(r.Veghiti),
      segmentIds: [num(r.IdButur1), num(r.IdButur2)].filter((x): x is number => x !== null),
    }];
  });
}

export interface RoadCondition {
  segmentId: number;
  name: string;
  condition: string;
  conditionIs: string;
  code: string;
  updated: string | null;
  severity: 'ok' | 'caution' | 'closed' | 'unknown';
}

export function roadSeverity(code: string, en: string): RoadCondition['severity'] {
  const c = code.toUpperCase();
  if (/OFAERT|LOKAD|CLOSED|IMPASSABLE/.test(c) || /impassable|closed/i.test(en)) return 'closed';
  if (/HALKA|HALT|SNJO|THAEFINGUR|KRAP|OVEDUR|THOKA|FJALLAB/.test(c) || /slippery|ice|snow|storm|fog|4x4/i.test(en)) return 'caution';
  if (/GREIDFAERT|GREIDF/.test(c) || /easily passable|good/i.test(en)) return 'ok';
  return 'unknown';
}

export function parseRoadConditions(data: unknown): RoadCondition[] {
  if (!Array.isArray(data)) return [];
  return data.filter(isRecord).flatMap((r) => {
    const id = num(r.IdButur);
    if (id === null) return [];
    const en = String(r.AstandLysingEn ?? '');
    const code = String(r.AstandYfirbord ?? '');
    const is = String(r.AstandLysing ?? '');
    return [{
      segmentId: id,
      name: String(r.FulltNafnButs ?? r.StuttNafnButs ?? ''),
      condition: en && en !== 'Not known' ? en : code === 'EKKI_I_THJONUSTU' ? 'Not serviced (no winter maintenance)' : is,
      conditionIs: is,
      code,
      updated: isoUtc(r.DagsSkrad),
      severity: roadSeverity(code, en || is),
    }];
  });
}

export interface NearbyRoad {
  station: RoadStation;
  distanceKm: number;
  conditions: RoadCondition[];
}

/** Road-weather stations within `km`, with conditions of the road segments they sit on. */
export function roadsNear(at: LatLon, stations: RoadStation[], conditions: RoadCondition[], km = 60, limit = 8): NearbyRoad[] {
  const bySeg = new Map(conditions.map((c) => [c.segmentId, c]));
  return stations
    .map((s) => ({ station: s, distanceKm: Math.round(haversineKm(at, s)), conditions: s.segmentIds.map((id) => bySeg.get(id)).filter((c): c is RoadCondition => !!c) }))
    .filter((r) => r.distanceKm <= km)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export interface CeiloObs extends LatLon {
  station: number;
  name: string;
  time: string;
  /** cloud amount, lowest layer, oktas 0–8 */
  oktas: number | null;
  /** cloud base, metres */
  baseM: number | null;
  /** visibility (m) */
  visibilityM: number | null;
}

export function parseCeilometer(obs: unknown, stations: unknown): CeiloObs[] {
  if (!Array.isArray(obs) || !Array.isArray(stations)) return [];
  const st = new Map<number, { name: string; lat: number; lon: number }>();
  for (const s of stations.filter(isRecord)) {
    const lat = num(s.lat);
    const lon = num(s.lon);
    if (lat !== null && lon !== null) st.set(Number(s.station), { name: String(s.name ?? s.station), lat, lon });
  }
  return obs.filter(isRecord).flatMap((o) => {
    const s = st.get(Number(o.station));
    const time = isoUtc(o.time);
    if (!s || !time) return [];
    const n1 = num(o.n1);
    return [{ station: Number(o.station), name: s.name, lat: s.lat, lon: s.lon, time, oktas: n1 === null ? null : Math.max(0, Math.min(8, n1)), baseM: num(o.h1), visibilityM: num(o.mor_v) }];
  });
}
