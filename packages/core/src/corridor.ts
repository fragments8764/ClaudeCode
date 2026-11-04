import { haversineKm } from './geo';
import type { RoadCondition, RoadStation } from './parse/iceland';
import type { LatLon } from './types';

/**
 * ROAD CORRIDOR (no routing engine): Vegagerðin publishes road-weather stations with
 * coordinates and per-segment conditions, but not road geometry. We approximate a drive by
 * the great-circle line from A to B and take every station within `widthKm` of it, ordered
 * along the way. Each becomes a coloured segment. Honest approximation — the UI says so.
 */
export type SegmentKind = 'clear' | 'slippery' | 'closed' | 'wind' | 'unknown';

export const GUST_WARN_MS = 15;

export interface CorridorSegment {
  station: string;
  lat: number;
  lon: number;
  /** 0–1 position along the route */
  at: number;
  kind: SegmentKind;
  gustMs: number | null;
  roadC: number | null;
  condition: string | null;
}

export interface Corridor {
  segments: CorridorSegment[];
  worst: SegmentKind;
  maxGust: number | null;
  iceRisk: boolean;
  /** human-readable warnings, most serious first */
  warnings: string[];
}

const RANK: Record<SegmentKind, number> = { closed: 4, wind: 3, slippery: 2, unknown: 1, clear: 0 };

/** Distance (km) from P to segment AB on a local equirectangular projection, plus position t along AB. */
function crossTrack(a: LatLon, b: LatLon, p: LatLon): { d: number; t: number } {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { d: Math.hypot(px - cx, py - cy) * 111, t };
}

export function classifyStation(s: RoadStation, conds: RoadCondition[]): SegmentKind {
  if (conds.some((c) => c.severity === 'closed')) return 'closed';
  if ((s.gustMs ?? 0) >= GUST_WARN_MS) return 'wind';
  if (conds.some((c) => c.severity === 'caution') || (s.roadC != null && s.roadC <= 0.5)) return 'slippery';
  if (conds.some((c) => c.severity === 'ok')) return 'clear';
  return s.gustMs != null || s.roadC != null ? 'clear' : 'unknown';
}

export function routeCorridor(from: LatLon, to: LatLon, stations: RoadStation[], conditions: RoadCondition[], widthKm = 15): Corridor {
  return pathCorridor([from, to], stations, conditions, widthKm);
}

/** Position of P relative to a polyline: distance (km) to the nearest point and 0–1 position along it. */
export function nearestOnPath(path: LatLon[], p: LatLon): { d: number; at: number } {
  if (path.length === 1) return { d: haversineKm(path[0]!, p), at: 0 };
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const l = haversineKm(path[i - 1]!, path[i]!);
    lens.push(l);
    total += l;
  }
  let best = { d: Infinity, at: 0 };
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const { d, t } = crossTrack(path[i - 1]!, path[i]!, p);
    if (d < best.d) best = { d, at: total ? (acc + t * lens[i - 1]!) / total : 0 };
    acc += lens[i - 1]!;
  }
  return best;
}

/**
 * Road stations and conditions along a route. With a real road route (from a routing
 * service) the corridor follows the actual roads and can be narrow (stations sit on the
 * road); with the straight-line fallback ([from, to]) it is wide.
 */
export function pathCorridor(path: LatLon[], stations: RoadStation[], conditions: RoadCondition[], widthKm = 15): Corridor {
  const bySeg = new Map(conditions.map((c) => [c.segmentId, c]));
  const from = path[0]!;
  const to = path[path.length - 1]!;
  const total = haversineKm(from, to);
  const segments: CorridorSegment[] = [];
  for (const s of stations) {
    const { d, at } = nearestOnPath(path, s);
    if (d > widthKm) continue;
    // ignore stations far beyond either end
    if ((at === 0 && haversineKm(from, s) > widthKm) || (at === 1 && haversineKm(to, s) > widthKm)) continue;
    const conds = s.segmentIds.map((id) => bySeg.get(id)).filter((c): c is RoadCondition => !!c);
    segments.push({
      station: s.name,
      lat: s.lat,
      lon: s.lon,
      at: total < 1 ? 0 : at,
      kind: classifyStation(s, conds),
      gustMs: s.gustMs,
      roadC: s.roadC,
      condition: conds.find((c) => c.severity !== 'ok')?.condition ?? conds[0]?.condition ?? null,
    });
  }
  segments.sort((a, b) => a.at - b.at);
  const worst = segments.reduce<SegmentKind>((w, s) => (RANK[s.kind] > RANK[w] ? s.kind : w), segments.length ? 'clear' : 'unknown');
  const gusts = segments.map((s) => s.gustMs).filter((g): g is number => g != null);
  const maxGust = gusts.length ? Math.max(...gusts) : null;
  const iceRisk = segments.some((s) => s.roadC != null && s.roadC <= 0.5) || segments.some((s) => s.kind === 'slippery');
  const warnings: string[] = [];
  for (const s of segments.filter((x) => x.kind === 'closed')) warnings.push(`${s.station}: ${s.condition ?? 'closed'}`);
  if (maxGust != null && maxGust >= GUST_WARN_MS) {
    const at = segments.find((s) => s.gustMs === maxGust)!;
    warnings.push(`Gusts up to ${Math.round(maxGust)} m/s near ${at.station}. Hold doors firmly and slow down.`);
  }
  for (const s of segments.filter((x) => x.kind === 'slippery').slice(0, 2)) warnings.push(`${s.station}: ${s.condition ?? `road ${Math.round(s.roadC ?? 0)}°C, expect ice`}`);
  return { segments, worst, maxGust, iceRisk, warnings };
}

/** Road-type caveats for curated spots (config/spots.json "roadType"). */
export type RoadType = 'paved' | 'gravel' | 'f-road';
export function roadTypeWarning(roadType: RoadType | undefined, conditionText?: string | null): string | null {
  if (roadType === 'f-road') return 'F-road / highland: not suitable for most rental cars, and usually closed in winter.';
  if (/fjallab|mountain vehicle|4x4/i.test(conditionText ?? '')) return 'Passable only for 4×4 / mountain vehicles: not for most rental cars.';
  if (roadType === 'gravel') return 'Gravel road: drive slowly; many rental agreements exclude gravel damage.';
  return null;
}

/* ── Road routing responses ─────────────────────────────────────────────────── */

export interface RoadRoute {
  distanceKm: number;
  durationMin: number;
  /** simplified polyline, [lat, lon] */
  path: LatLon[];
}

/** OSRM /route/v1 with geometries=geojson. */
export function parseOsrmRoute(raw: unknown): RoadRoute | null {
  const r = (raw as { code?: string; routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[] })?.routes?.[0];
  if ((raw as { code?: string })?.code !== 'Ok' || !r || !Array.isArray(r.geometry?.coordinates)) return null;
  return { distanceKm: Math.round(r.distance / 100) / 10, durationMin: Math.round(r.duration / 60), path: thinPath(r.geometry!.coordinates!.map(([lon, lat]) => ({ lat, lon }))) };
}

/** openrouteservice /v2/directions/driving-car/geojson. */
export function parseOrsRoute(raw: unknown): RoadRoute | null {
  const f = (raw as { features?: { geometry?: { coordinates?: [number, number][] }; properties?: { summary?: { distance: number; duration: number } } }[] })?.features?.[0];
  const sum = f?.properties?.summary;
  if (!f || !sum || !Array.isArray(f.geometry?.coordinates)) return null;
  return { distanceKm: Math.round(sum.distance / 100) / 10, durationMin: Math.round(sum.duration / 60), path: thinPath(f.geometry!.coordinates!.map(([lon, lat]) => ({ lat, lon }))) };
}

/** Keep at most `max` points (evenly), always including both ends. */
export function thinPath(p: LatLon[], max = 200): LatLon[] {
  if (p.length <= max) return p;
  const step = (p.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => p[Math.round(i * step)]!);
}
