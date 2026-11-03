import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestNight, calibration, eveningOf, freshness, parseOmni2, resolveWeights, selectNights, WEIGHTS } from '../index';

// Real NASA/GSFC OMNI2 hourly data (2024 days 10–12, 130–132 = 10–11 May G5 storm, 283–285 = 10 Oct G4 storm).
const omni = parseOmni2(readFileSync(new URL('./fixtures/omni2-2024-sample.dat', import.meta.url), 'utf8'));

describe('OMNI2', () => {
  it('parses real hours with Kp, Bz, speed', () => {
    expect(omni.length).toBe(9 * 24);
    const peak = omni.reduce((a, b) => ((b.kp ?? 0) > (a.kp ?? 0) ? b : a));
    expect(peak.kp).toBeGreaterThanOrEqual(8.5); // the May 2024 extreme storm
    expect(peak.time.startsWith('2024-05-1')).toBe(true);
    expect(omni.every((h) => h.bz === null || Math.abs(h.bz) < 200)).toBe(true);
  });
  it('selects storm and quiet nights from the data itself (dark season only)', () => {
    const picks = selectNights(omni, { stormKp: 7, quietKp: 3, max: 5 });
    const storms = picks.filter((p) => p.kind === 'storm');
    expect(storms.map((s) => s.date)).toContain('2024-10-10');
    expect(storms.some((s) => s.date.startsWith('2024-05'))).toBe(false); // May is excluded (light nights)
  });
});

describe('backtest', () => {
  const rvk = { name: 'Reykjavík', lat: 64.15, lon: -21.94 };
  it('storm night scores high under clear skies; cloud history lowers it', () => {
    const storm = backtestNight({ date: '2024-10-10', maxKp: 8.7, kind: 'storm' }, rvk, omni, null);
    expect(storm.peakClearSky).toBeGreaterThanOrEqual(60);
    expect(storm.peakScore).toBeNull();
    const cloudy = new Map(Array.from({ length: 13 }, (_, i) => [new Date(Date.parse('2024-10-10T18:00:00Z') + i * 3.6e6).toISOString().slice(0, 13), 90]));
    const withCloud = backtestNight({ date: '2024-10-10', maxKp: 8.7, kind: 'storm' }, rvk, omni, cloudy);
    expect(withCloud.peakScore!).toBeLessThan(storm.peakClearSky);
    expect(withCloud.meanCloud).toBe(90);
  });
  it('quiet January night scores lower than the storm', () => {
    const quiet = backtestNight({ date: '2024-01-11', maxKp: 2, kind: 'quiet' }, rvk, omni, null);
    const storm = backtestNight({ date: '2024-10-10', maxKp: 8.7, kind: 'storm' }, rvk, omni, null);
    expect(quiet.peakClearSky).toBeLessThan(storm.peakClearSky);
  });
});

describe('backtest window', () => {
  it('scores exactly the hours selectNights considers (18–05 UTC), never 06:00', () => {
    // synthetic: quiet all night, a spike only at 06:00 → must not leak into the night's peak
    const hours = Array.from({ length: 14 }, (_, i) => ({ time: new Date(Date.parse('2023-11-11T17:00:00Z') + i * 3.6e6).toISOString(), kp: i === 13 ? 4 : 0.7, bz: 0, speed: 450, density: 5 }));
    const r = backtestNight({ date: '2023-11-11', maxKp: 0.7, kind: 'quiet' }, { name: 'R', lat: 64.15, lon: -21.94 }, hours, null);
    expect(r.peakClearSky).toBeLessThan(20);
  });
});

describe('calibration & helpers', () => {
  it('buckets outcomes and computes Brier', () => {
    const c = calibration([
      { predicted: 80, saw: true },
      { predicted: 75, saw: true },
      { predicted: 5, saw: false },
      { predicted: 40, saw: false },
    ]);
    expect(c.n).toBe(4);
    expect(c.buckets.find((b) => b.range === '70–100')!.sawRate).toBe(1);
    expect(c.brier).toBeLessThan(0.1);
    expect(calibration([]).brier).toBeNull();
  });
  it('eveningOf groups small hours with the previous evening', () => {
    expect(eveningOf('2026-11-03T02:00:00Z')).toBe('2026-11-02');
    expect(eveningOf('2026-11-02T22:00:00Z')).toBe('2026-11-02');
  });
  it('freshness: live ≤ 2×TTL, then stale, then expired', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    expect(freshness('2026-11-03T11:45:00Z', 600, now).state).toBe('live');
    expect(freshness('2026-11-03T11:30:00Z', 600, now)).toEqual({ state: 'stale', ageMin: 30 });
    expect(freshness('2026-11-02T12:00:00Z', 600, now).state).toBe('expired');
    expect(freshness(null, 600, now).state).toBe('unknown');
  });
  it('resolveWeights ignores junk', () => {
    expect(resolveWeights({ OVATION_FULL: 40, BZ_SOUTH_MAX: 'x' }).OVATION_FULL).toBe(40);
    expect(resolveWeights({ BZ_SOUTH_MAX: 'x' }).BZ_SOUTH_MAX).toBe(WEIGHTS.BZ_SOUTH_MAX);
  });
});
