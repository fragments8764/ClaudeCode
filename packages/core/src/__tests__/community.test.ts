import { describe, expect, it } from 'vitest';
import { feedRank, verifySighting, type SightingLite } from '../index';

const s = (id: string, at: string, lat = 64.1, lon = -21.9, signals?: SightingLite['signals']): SightingLite => ({ id, at, lat, lon, signals });

describe('sighting verification', () => {
  it('a lone report with quiet signals is unverified', () => {
    const v = verifySighting(s('a', '2026-11-02T22:00:00Z', 64.1, -21.9, { oval: 3, nowcast: 'quiet', groundBay: 10 }), []);
    expect(v).toMatchObject({ confidence: 'unverified', verified: false, nearbyReports: 0 });
  });
  it('another user nearby + oval in view → verified (medium)', () => {
    const a = s('a', '2026-11-02T22:00:00Z', 64.1, -21.9, { oval: 15, nowcast: 'quiet', groundBay: null });
    const v = verifySighting(a, [a, s('b', '2026-11-02T22:30:00Z', 64.3, -21.5)]);
    expect(v.verified).toBe(true);
    expect(v.confidence).toBe('medium');
    expect(v.reasons.join(' ')).toMatch(/1 other report.*OVATION 15/);
  });
  it('ignores reports too far away or too long apart', () => {
    const a = s('a', '2026-11-02T22:00:00Z');
    expect(verifySighting(a, [s('far', '2026-11-02T22:00:00Z', 66, -15), s('late', '2026-11-02T23:30:00Z')]).nearbyReports).toBe(0);
  });
  it('several users + magnetometer + oval → high', () => {
    const a = s('a', '2026-11-02T22:00:00Z', 64.1, -21.9, { oval: 30, nowcast: 'onset', groundBay: 250 });
    const v = verifySighting(a, [s('b', '2026-11-02T22:05:00Z'), s('c', '2026-11-02T21:40:00Z')]);
    expect(v.confidence).toBe('high');
  });
});

describe('feed ranking', () => {
  it('featured > verified > bright > recent', () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const r = (p: Partial<{ at: string; brightness: number; verified: boolean; featured: boolean }>) => feedRank({ at: '2026-11-07T22:00:00Z', brightness: 3, verified: false, ...p }, now);
    expect(r({ featured: true })).toBeGreaterThan(r({ verified: true, brightness: 5 }));
    expect(r({ verified: true })).toBeGreaterThan(r({ brightness: 5 }));
    expect(r({ at: '2026-11-07T22:00:00Z' })).toBeGreaterThan(r({ at: '2026-11-02T22:00:00Z' }));
  });
});
