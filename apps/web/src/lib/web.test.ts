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
