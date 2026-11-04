import { describe, expect, it } from 'vitest';
import { classifyStation, roadTypeWarning, routeCorridor, type RoadCondition, type RoadStation } from '../index';

const st = (name: string, lat: number, lon: number, p: Partial<RoadStation> = {}): RoadStation => ({ id: Math.random(), name, lat, lon, time: null, windMs: 5, gustMs: 8, airC: 3, roadC: 3, segmentIds: [], ...p });
const cond = (id: number, severity: RoadCondition['severity'], condition: string): RoadCondition => ({ segmentId: id, name: 'x', condition, conditionIs: '', code: '', updated: null, severity });

describe('route corridor', () => {
  const A = { lat: 64.0, lon: -22.0 };
  const B = { lat: 64.0, lon: -20.0 }; // ~98 km due east
  it('keeps stations near the line, ordered along it, and ignores far ones', () => {
    const c = routeCorridor(A, B, [st('mid', 64.02, -21.0), st('near-start', 64.0, -21.8), st('far-north', 64.6, -21.0)], []);
    expect(c.segments.map((s) => s.station)).toEqual(['near-start', 'mid']);
    expect(c.worst).toBe('clear');
  });
  it('flags closures, high wind (>15 m/s) and ice, worst first', () => {
    const c = routeCorridor(
      A,
      B,
      [st('icy', 64.0, -21.5, { roadC: -1 }), st('windy', 64.0, -21.0, { gustMs: 22 }), st('shut', 64.0, -20.5, { segmentIds: [7] })],
      [cond(7, 'closed', 'Impassable')],
    );
    expect(c.segments.map((s) => s.kind)).toEqual(['slippery', 'wind', 'closed']);
    expect(c.worst).toBe('closed');
    expect(c.maxGust).toBe(22);
    expect(c.iceRisk).toBe(true);
    expect(c.warnings[0]).toMatch(/shut: Impassable/);
    expect(c.warnings[1]).toMatch(/22 m\/s/);
  });
  it('classifies a station', () => {
    expect(classifyStation(st('x', 0, 0, { gustMs: 16 }), [])).toBe('wind');
    expect(classifyStation(st('x', 0, 0), [cond(1, 'caution', 'Slippery')])).toBe('slippery');
    expect(classifyStation(st('x', 0, 0, { gustMs: null, roadC: null }), [])).toBe('unknown');
  });
  it('empty corridor is unknown, not "clear"', () => {
    expect(routeCorridor(A, B, [], []).worst).toBe('unknown');
  });
});

describe('road type warnings', () => {
  it('F-roads and 4x4-only conditions are not for rental cars', () => {
    expect(roadTypeWarning('f-road')).toMatch(/rental cars/);
    expect(roadTypeWarning('paved', 'Fært fjallabílum')).toMatch(/4×4/);
    expect(roadTypeWarning('gravel')).toMatch(/Gravel/);
    expect(roadTypeWarning('paved')).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { nearestOnPath, parseOrsRoute, parseOsrmRoute, pathCorridor, thinPath } from '../corridor';
describe('real road routes (regression: straight-line drive times and hazards)', () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/osrm-rvk-kleifarvatn.json', import.meta.url), 'utf8'));
  it('parses a recorded OSRM route Reykjavík → Kleifarvatn', () => {
    const r = parseOsrmRoute(raw)!;
    expect(r.distanceKm).toBeGreaterThan(28);
    expect(r.distanceKm).toBeLessThan(40);
    expect(r.durationMin).toBeGreaterThan(25);
    expect(r.path.length).toBeLessThanOrEqual(200);
    expect(r.path[0]!.lat).toBeCloseTo(64.15, 1);
  });
  it('rejects error responses', () => {
    expect(parseOsrmRoute({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseOrsRoute({})).toBeNull();
  });
  it('parses openrouteservice GeoJSON', () => {
    const r = parseOrsRoute({ features: [{ geometry: { coordinates: [[-21.94, 64.15], [-22.06, 63.93]] }, properties: { summary: { distance: 32150, duration: 2100 } } }] })!;
    expect(r).toMatchObject({ distanceKm: 32.2, durationMin: 35 });
  });
  it('a station beside the road counts; one 10 km off the road does not (narrow corridor)', () => {
    const path = parseOsrmRoute(raw)!.path;
    const onRoad = path[Math.floor(path.length / 2)]!;
    const st = (name: string, lat: number, lon: number) => ({ id: 1, name, lat, lon, time: null, windMs: 10, gustMs: 22, airC: 0, roadC: -1, segmentIds: [] });
    const c = pathCorridor(path, [st('On road', onRoad.lat + 0.005, onRoad.lon), st('Far off', onRoad.lat, onRoad.lon + 0.25)], [], 4);
    expect(c.segments.map((s) => s.station)).toEqual(['On road']);
    expect(c.segments[0]!.at).toBeGreaterThan(0.2);
    expect(c.maxGust).toBe(22);
  });
  it('thins long paths and measures position along them', () => {
    const p = Array.from({ length: 1000 }, (_, i) => ({ lat: 64, lon: -22 + i / 1000 }));
    expect(thinPath(p, 50)).toHaveLength(50);
    expect(nearestOnPath(p, { lat: 64.0, lon: -21.5 }).at).toBeCloseTo(0.5, 2);
  });
});
