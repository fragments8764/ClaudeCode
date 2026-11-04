import { describe, expect, it } from 'vitest';
import { DICTS, translate } from './i18n';
import { badges, nightKey, stats, type JournalEntry } from './journal';
import { tileList } from './offlineMap';

describe('i18n', () => {
  it('every language covers every user-facing chrome key', () => {
    const keys = Object.keys(DICTS.en).filter((k) => k !== 'stat.kp');
    for (const [lang, d] of Object.entries(DICTS)) {
      const missing = keys.filter((k) => !(k in d) && k !== 'stat.kp');
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });
  it('no language has keys English lacks (typos)', () => {
    for (const d of Object.values(DICTS)) for (const k of Object.keys(d)) expect(DICTS.en).toHaveProperty([k]);
  });
  it('interpolates and falls back', () => {
    expect(translate('de', 'nudge', { n: 64 })).toBe('Polarlicht-Chance auf 64 gestiegen');
    expect(translate('ja', 'stat.kp')).toBe('Kp');
    expect(translate('is', 'does.not.exist')).toBe('does.not.exist');
  });
});

const e = (p: Partial<JournalEntry>): JournalEntry => ({ id: Math.random().toString(), at: '2026-11-02T22:00:00Z', place: 'X', lat: 64, lon: -21, saw: false, brightness: null, colors: [], score: null, kp: null, cloud: null, notes: '', ...p });

describe('journal', () => {
  it('counts nights by evening (after-midnight sightings belong to the previous night)', () => {
    expect(nightKey('2026-11-03T02:00:00Z')).toBe(nightKey('2026-11-02T21:00:00Z'));
    const s = stats([e({ at: '2026-11-02T21:00:00Z' }), e({ at: '2026-11-03T02:00:00Z', saw: true, kp: 4.3, colors: ['green'] }), e({ at: '2026-11-05T22:00:00Z' })]);
    expect(s).toMatchObject({ nightsOut: 2, nightsSeen: 1, bestKp: 4.3, colors: ['green'] });
  });
  it('badges', () => {
    const none = badges([]);
    expect(none.every((b) => !b.earned)).toBe(true);
    const got = badges([e({ saw: true, colors: ['green', 'red', 'purple'], kp: 6.3, at: '2026-11-03T02:30:00' })]);
    const earned = got.filter((b) => b.earned).map((b) => b.id);
    expect(earned).toEqual(expect.arrayContaining(['first', 'colors', 'red', 'storm']));
  });
});

describe('offline map', () => {
  it('covers Iceland at z3–9 with a sane tile count', () => {
    const t = tileList('https://t/{z}/{x}/{y}.pbf');
    expect(t.length).toBeGreaterThan(100);
    expect(t.length).toBeLessThan(800);
    expect(t).toContain('https://t/3/3/2.pbf');
  });
});

import { shouldApply } from './update';
describe('auto-update timing', () => {
  const base = { pending: true, hidden: false, force: false, safe: true, idleMs: 60_000 };
  it('does nothing without a new version', () => expect(shouldApply({ ...base, pending: false })).toBe(false));
  it('applies while the app is in the background', () => expect(shouldApply({ ...base, safe: false, idleMs: 0, hidden: true })).toBe(true));
  it('applies when idle with nothing open', () => expect(shouldApply(base)).toBe(true));
  it('waits while a sheet is open, you are typing or driving', () => expect(shouldApply({ ...base, safe: false })).toBe(false));
  it('waits while you are actively using the app', () => expect(shouldApply({ ...base, idleMs: 3_000 })).toBe(false));
  it('applies at once after a manual check', () => expect(shouldApply({ ...base, safe: false, idleMs: 0, force: true })).toBe(true));
});

import { hhmm, setDisplayTimeZone, whenDay } from './format';
describe('location-local times (regression: phone in New York showed Iceland times in EST)', () => {
  it('formats in the location zone, not the phone zone', () => {
    setDisplayTimeZone('Atlantic/Reykjavik');
    expect(hhmm('2026-11-04T16:09:00Z')).toBe('16:09');
    setDisplayTimeZone('America/New_York');
    expect(hhmm('2026-11-04T16:09:00Z')).toBe('11:09');
  });
  it('"tomorrow" is judged by the location calendar day', () => {
    setDisplayTimeZone('Atlantic/Reykjavik');
    const now = new Date('2026-11-04T23:30:00Z');
    expect(whenDay('2026-11-05T00:30:00Z', now)).toBe('tomorrow 00:30');
    setDisplayTimeZone('America/New_York'); // still 4 Nov evening there
    expect(whenDay('2026-11-05T00:30:00Z', now)).toBe('19:30');
  });
  it('ignores an invalid zone instead of crashing', () => {
    setDisplayTimeZone('Not/AZone');
    expect(() => hhmm('2026-11-04T16:09:00Z')).not.toThrow();
    setDisplayTimeZone(null);
  });
});

import { emergencyNumber } from './format';
describe('emergency number (regression: "Call 112" shown in Canada/Alaska)', () => {
  it('uses the location timezone when known', () => {
    expect(emergencyNumber(64.15, -21.94, 'Atlantic/Reykjavik')).toBe('112');
    expect(emergencyNumber(62.45, -114.37, 'America/Yellowknife')).toBe('911');
    expect(emergencyNumber(64.84, -147.72, 'America/Anchorage')).toBe('911');
    expect(emergencyNumber(64.18, -51.69, 'America/Nuuk')).toBe('112');
    expect(emergencyNumber(69.65, 18.96, 'Europe/Oslo')).toBe('112');
  });
  it('falls back to longitude without a timezone', () => {
    expect(emergencyNumber(64.84, -147.72, undefined)).toBe('911');
    expect(emergencyNumber(64.15, -21.94, undefined)).toBe('112');
  });
});

import { labelFor } from '../hooks/useGeolocation';
describe('place names beyond Iceland (regression: Tromsø showed as raw coordinates)', () => {
  it('names nearby Arctic bases', () => {
    expect(labelFor(69.6496, 18.956)).toBe('Tromsø');
    expect(labelFor(64.86, -147.8)).toMatch(/Fairbanks/);
    expect(labelFor(64.1466, -21.9426)).toBe('Reykjavík');
  });
});

import { drainPer10Min, fpsByScreen, shouldAutoLowPower } from './perf';
describe('field performance monitor', () => {
  const w = (fps: number, screen = 'tonight') => ({ at: 0, fps, screen });
  it('auto Low power needs two slow windows in a row (one hiccup is fine)', () => {
    expect(shouldAutoLowPower([w(58), w(31)])).toBe(false);
    expect(shouldAutoLowPower([w(31), w(58)])).toBe(false);
    expect(shouldAutoLowPower([w(58), w(35), w(38)])).toBe(true);
    expect(shouldAutoLowPower([w(39.9)])).toBe(false);
  });
  it('summarises fps per screen', () => {
    expect(fpsByScreen([w(60), w(50), w(30, 'map')])).toEqual([
      { screen: 'tonight', avg: 55, worst: 50, windows: 2 },
      { screen: 'map', avg: 30, worst: 30, windows: 1 },
    ]);
  });
  it('battery drain per 10 min ignores charging samples', () => {
    const t0 = 1_000_000;
    expect(drainPer10Min([{ at: t0, level: 0.8, charging: false }, { at: t0 + 20 * 60_000, level: 0.76, charging: false }])).toBe(2);
    expect(drainPer10Min([{ at: t0, level: 0.8, charging: true }, { at: t0 + 20 * 60_000, level: 0.9, charging: true }])).toBeNull();
    expect(drainPer10Min([{ at: t0, level: 0.8, charging: false }])).toBeNull();
  });
});
