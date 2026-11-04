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
