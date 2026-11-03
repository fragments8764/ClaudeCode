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
  const bySeg = new Map(conditions.map((c) => [c.segmentId, c]));
  const total = haversineKm(from, to);
  const segments: CorridorSegment[] = [];
  for (const s of stations) {
    const { d, t } = crossTrack(from, to, s);
    if (d > widthKm) continue;
    // ignore stations far beyond either end
    if ((t === 0 && haversineKm(from, s) > widthKm) || (t === 1 && haversineKm(to, s) > widthKm)) continue;
    const conds = s.segmentIds.map((id) => bySeg.get(id)).filter((c): c is RoadCondition => !!c);
    segments.push({
      station: s.name,
      lat: s.lat,
      lon: s.lon,
      at: total < 1 ? 0 : t,
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
