import { describe, expect, it } from 'vitest';
import ov from './fixtures/ovation.json';
import {
  activityFactor,
  bestWindow,
  computeScore,
  hourlyOutlook,
  kpAt,
  moonFactor,
  ovationAt,
  ovationValue,
  parseOvation,
  ParseError,
  type ScoreInputs,
} from '../index';

describe('OVATION', () => {
  const grid = parseOvation(ov);
  it('parses grid and metadata', () => {
    expect(grid.forecastTime).toBe('2026-11-02T22:48:00.000Z');
    expect(ovationValue(grid, 65, -22)).toBe(9); // lon -22 → 338
  });
  it('visible ≥ overhead, and finds the oval north of a southern site', () => {
    const vik = ovationAt(grid, 63.42, -19.0);
    expect(vik.visible).toBeGreaterThanOrEqual(vik.overhead);
    expect(vik.peakLat).toBeGreaterThan(63);
  });
  it('rejects junk', () => {
    expect(() => parseOvation({ coordinates: [[0, 0, 1]] })).toThrow(ParseError);
    expect(() => parseOvation(null)).toThrow(ParseError);
  });
});

const NIGHT: ScoreInputs = {
  sunAltDeg: -30,
  moonAltDeg: -10,
  moonIllumination: 0.4,
  cloud: 0,
  ovation: 10,
  kp: 2,
  bz: 0,
  speed: 400,
};

describe('Aurora Score', () => {
  it('quiet but clear dark night in Iceland is "possible"/"worth a look"', () => {
    const r = computeScore(NIGHT);
    expect(r.score).toBeGreaterThanOrEqual(12);
    expect(r.score).toBeLessThan(50);
    expect(r.limiting).toBe('activity');
    expect(r.limitingLabel).toBe('Quiet sun');
  });
  it('storm + clear + dark = go', () => {
    const r = computeScore({ ...NIGHT, ovation: 45, kp: 6.3, bz: -12, speed: 650 });
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.verdict).toBe('go');
    expect(r.limiting).toBeNull();
  });
  it('overcast kills even a big storm, and clouds are the limiting factor', () => {
    const r = computeScore({ ...NIGHT, ovation: 45, kp: 7, bz: -15, cloud: 100 });
    expect(r.score).toBe(0);
    expect(r.limitingLabel).toBe('Clouds');
  });
  it('daylight → wait for darkness', () => {
    const r = computeScore({ ...NIGHT, sunAltDeg: 10, ovation: 60, kp: 8 });
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('wait-dark');
    expect(r.limitingLabel).toBe('Daylight');
  });
  it('is monotonic in each input', () => {
    const s = (p: Partial<ScoreInputs>) => computeScore({ ...NIGHT, ...p }).score;
    expect(s({ cloud: 20 })).toBeGreaterThan(s({ cloud: 60 }));
    expect(s({ kp: 4 })).toBeGreaterThan(s({ kp: 2 }));
    expect(s({ bz: -8 })).toBeGreaterThan(s({ bz: 0 }));
    expect(s({ bz: 0 })).toBeGreaterThan(s({ bz: 6 }));
    expect(s({ sunAltDeg: -18 })).toBeGreaterThan(s({ sunAltDeg: -8 }));
    expect(s({ moonAltDeg: 40, moonIllumination: 1 })).toBeLessThan(s({}));
  });
  it('full moon high up costs at most 35%', () => {
    expect(moonFactor(1, 60)).toBeCloseTo(0.65);
    expect(moonFactor(1, -5)).toBe(1);
  });
  it('falls back to Kp when OVATION missing, and records missing inputs', () => {
    const r = computeScore({ ...NIGHT, ovation: null, bz: null, cloud: null });
    expect(r.missing).toEqual(['cloud', 'ovation', 'bz']);
    expect(r.score).toBeGreaterThan(0);
  });
  it('south Bz cannot conjure aurora when the oval is far away', () => {
    const far = activityFactor({ ovation: 0, kp: 0.5, bz: -20, speed: 400 });
    expect(far).toBeLessThan(0.15);
  });
});

describe('outlook & best window', () => {
  const kpSeries = [
    { time: '2026-11-02T18:00:00.000Z', kp: 2 },
    { time: '2026-11-02T21:00:00.000Z', kp: 4 },
    { time: '2026-11-03T00:00:00.000Z', kp: 3 },
  ];
  it('kpAt picks the 3-hour slot', () => {
    expect(kpAt(kpSeries, new Date('2026-11-02T22:30:00Z'))).toBe(4);
    expect(kpAt(kpSeries, new Date('2026-11-02T10:00:00Z'))).toBeNull();
  });
  it('bestWindow picks the clear, dark, active hours', () => {
    const hours = Array.from({ length: 8 }, (_, i) => {
      const t = new Date(Date.UTC(2026, 10, 2, 18 + i));
      return { time: t.toISOString(), cloud: i === 4 || i === 5 ? 10 : 90, kp: kpAt(kpSeries, t) };
    });
    const out = hourlyOutlook(hours, () => ({ sunAlt: -30, moonAlt: -5, moonIllumination: 0.3 }));
    const w = bestWindow(out, 2)!;
    expect(w.start).toBe('2026-11-02T22:00:00.000Z');
    expect(w.end).toBe('2026-11-03T00:00:00.000Z');
    expect(bestWindow(out.map((h) => ({ ...h, score: 0 })))).toBeNull();
  });
});
