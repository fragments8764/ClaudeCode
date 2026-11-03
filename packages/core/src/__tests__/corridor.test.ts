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
