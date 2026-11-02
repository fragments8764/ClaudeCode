import { describe, expect, it } from 'vitest';
import { darknessFactor, darknessLevel, intervalsWhere, moonPhaseName, planNight, sunAltitudeDeg } from '../astro';

const RVK = { lat: 64.1466, lon: -21.9426 };

describe('darknessLevel', () => {
  it('classifies twilight bands', () => {
    expect(darknessLevel(10)).toBe('day');
    expect(darknessLevel(-3)).toBe('civil');
    expect(darknessLevel(-9)).toBe('nautical');
    expect(darknessLevel(-15)).toBe('astronomical');
    expect(darknessLevel(-25)).toBe('night');
  });
  it('darknessFactor is 0 in daylight, 1 at night, monotonic between', () => {
    expect(darknessFactor(5)).toBe(0);
    expect(darknessFactor(-20)).toBe(1);
    expect(darknessFactor(-6)).toBeLessThan(darknessFactor(-12));
  });
});

describe('sun position', () => {
  it('is high at Reykjavík solar noon on midsummer, below horizon at midnight in winter', () => {
    // Solar noon in Reykjavík ≈ 13:30 UTC
    expect(sunAltitudeDeg(new Date('2026-06-21T13:30:00Z'), RVK.lat, RVK.lon)).toBeGreaterThan(45);
    expect(sunAltitudeDeg(new Date('2026-12-21T01:30:00Z'), RVK.lat, RVK.lon)).toBeLessThan(-40);
  });
});

describe('planNight', () => {
  it('finds a long dark window on a November evening in Reykjavík', () => {
    const plan = planNight(new Date('2026-11-02T12:00:00Z'), RVK.lat, RVK.lon);
    expect(plan.noDarkness).toBe(false);
    expect(plan.darkNow).toBe(false);
    expect(plan.sunset).not.toBeNull();
    expect(plan.darkStart).not.toBeNull();
    // Sunset in Reykjavík on 2 Nov ≈ 16:50 UTC; nautical dark ≈ 18:15 UTC.
    const sunsetH = new Date(plan.sunset!).getUTCHours() + new Date(plan.sunset!).getUTCMinutes() / 60;
    expect(sunsetH).toBeGreaterThan(16.3);
    expect(sunsetH).toBeLessThan(17.3);
    expect(new Date(plan.darkStart!) > new Date(plan.sunset!)).toBe(true);
    // Dark period should be > 10 h at this time of year.
    const iv = plan.darkIntervals[0]!;
    expect((new Date(iv.end).getTime() - new Date(iv.start).getTime()) / 3.6e6).toBeGreaterThan(10);
  });

  it('reports darkNow and start=now when already dark', () => {
    const now = new Date('2026-11-02T23:00:00Z');
    const plan = planNight(now, RVK.lat, RVK.lon);
    expect(plan.darkNow).toBe(true);
    expect(plan.darkStart).toBe(now.toISOString());
  });

  it('reports no darkness around midsummer (works where SunCalc times are NaN)', () => {
    const plan = planNight(new Date('2026-06-21T12:00:00Z'), 65.6885, -18.1262); // Akureyri
    expect(plan.noDarkness).toBe(true);
    expect(plan.darkStart).toBeNull();
    expect(plan.moonMaxAltDuringDark).toBeNull();
  });

  it('moon fields are sane', () => {
    const plan = planNight(new Date('2026-11-02T20:00:00Z'), RVK.lat, RVK.lon);
    expect(plan.moon.illumination).toBeGreaterThanOrEqual(0);
    expect(plan.moon.illumination).toBeLessThanOrEqual(1);
    expect(plan.moon.bearingDeg).toBeGreaterThanOrEqual(0);
    expect(plan.moon.bearingDeg).toBeLessThan(360);
  });
});

describe('helpers', () => {
  it('intervalsWhere groups contiguous samples', () => {
    const s = [0, 1, 1, 0, 1].map((v, i) => ({ time: `T${i}`, sunAlt: v, moonAlt: 0 }));
    expect(intervalsWhere(s, (x) => x.sunAlt === 1)).toEqual([
      { start: 'T1', end: 'T3' },
      { start: 'T4', end: 'T4' },
    ]);
  });
  it('moonPhaseName', () => {
    expect(moonPhaseName(0)).toBe('New moon');
    expect(moonPhaseName(0.5)).toBe('Full moon');
    expect(moonPhaseName(0.25)).toBe('First quarter');
    expect(moonPhaseName(0.9)).toBe('Waning crescent');
  });
});
