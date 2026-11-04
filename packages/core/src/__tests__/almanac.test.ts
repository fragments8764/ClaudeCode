import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { moonAltitudeDeg } from '../moon';
import { SUN, sunAltitudeDeg } from '../astro';

/**
 * Regression: moonrise/moonset used to be computed from SunCalc's geocentric moon at 0°,
 * which put them 15 min off on average (up to 49 min) in Iceland. Checked against the US
 * Naval Observatory's published times (recorded fixture: 3 places × 15 days).
 */
const fx = JSON.parse(readFileSync(new URL('./fixtures/usno-rise-set-2026-11.json', import.meta.url), 'utf8')) as {
  events: { place: string; lat: number; lon: number; body: 'sun' | 'moon'; event: 'Rise' | 'Set'; time: string }[];
};

/** Find our crossing nearest the reference time (±3 h, 15 s steps); minutes of difference. */
function deltaMin(f: (t: Date) => number, ref: string, rise: boolean): number | null {
  const r = Date.parse(ref);
  let best: number | null = null;
  let prev: number | null = null;
  for (let s = -180; s <= 180; s += 0.25) {
    const a = f(new Date(r + s * 60_000));
    if (prev != null && (rise ? prev < 0 && a >= 0 : prev > 0 && a <= 0) && (best == null || Math.abs(s) < Math.abs(best))) best = s;
    prev = a;
  }
  return best;
}

describe('almanac accuracy vs US Naval Observatory', () => {
  const moon = fx.events.filter((e) => e.body === 'moon');
  const sun = fx.events.filter((e) => e.body === 'sun');

  it('has a meaningful fixture', () => {
    expect(moon.length).toBeGreaterThan(50);
    expect(sun.length).toBeGreaterThan(50);
  });

  it('moonrise and moonset are within 2 minutes (mean under 1 minute)', () => {
    const d = moon.map((e) => deltaMin((t) => moonAltitudeDeg(t, e.lat, e.lon), e.time, e.event === 'Rise'));
    expect(d.every((x) => x != null)).toBe(true);
    const abs = d.map((x) => Math.abs(x!));
    expect(Math.max(...abs)).toBeLessThanOrEqual(2);
    expect(abs.reduce((a, b) => a + b, 0) / abs.length).toBeLessThan(1);
  });

  it('sunrise and sunset are within 3 minutes', () => {
    const d = sun.map((e) => deltaMin((t) => sunAltitudeDeg(t, e.lat, e.lon) - SUN.horizon, e.time, e.event === 'Rise'));
    const abs = d.map((x) => Math.abs(x!));
    expect(Math.max(...abs)).toBeLessThanOrEqual(3);
  });
});

import { nextDarkNight } from '../astro';
describe('light season (regression: "Wait for darkness" with no date during midnight sun)', () => {
  it('Reykjavík: no aurora darkness at midsummer; it returns in early-mid August', () => {
    const d = nextDarkNight(new Date('2027-06-21T23:30:00Z'), 64.1466, -21.9426)!;
    expect(d.toISOString().slice(0, 7)).toBe('2027-08');
    expect(d.getUTCDate()).toBeGreaterThanOrEqual(1);
    expect(d.getUTCDate()).toBeLessThanOrEqual(20);
  });
  it('in winter the next dark night is tonight', () => {
    const now = new Date('2026-11-04T15:00:00Z');
    const d = nextDarkNight(now, 64.1466, -21.9426)!;
    expect(d.getTime() - now.getTime()).toBeLessThan(864e5);
  });
});
