import { describe, expect, it } from 'vitest';
import { compassLabel, haversineKm, isInIceland, isValidLatLon, snapCoord, ICELAND_PLACES } from '../geo';
import { formatAge } from '../freshness';

describe('geo', () => {
  it('haversine Reykjavík → Akureyri ≈ 250 km', () => {
    const rvk = ICELAND_PLACES.find((p) => p.id === 'reykjavik')!;
    const aku = ICELAND_PLACES.find((p) => p.id === 'akureyri')!;
    const d = haversineKm(rvk, aku);
    expect(d).toBeGreaterThan(240);
    expect(d).toBeLessThan(260);
  });
  it('snapCoord', () => {
    expect(snapCoord(64.1466)).toBe(64.15);
    expect(snapCoord(-21.9426)).toBe(-21.95);
    expect(snapCoord(-21.9426, 0.1)).toBe(-21.9);
  });
  it('validation and bounds', () => {
    expect(isValidLatLon(64, -21)).toBe(true);
    expect(isValidLatLon(91, 0)).toBe(false);
    expect(isValidLatLon(NaN, 0)).toBe(false);
    expect(ICELAND_PLACES.every(isInIceland)).toBe(true);
    expect(isInIceland({ lat: 69.65, lon: 18.96 })).toBe(false); // Tromsø
  });
  it('compassLabel', () => {
    expect(compassLabel(0)).toBe('N');
    expect(compassLabel(359)).toBe('N');
    expect(compassLabel(90)).toBe('E');
    expect(compassLabel(-45)).toBe('NW');
  });
  it('formatAge', () => {
    const now = new Date('2026-11-02T21:00:00Z');
    expect(formatAge('2026-11-02T20:59:40Z', now)).toBe('just now');
    expect(formatAge('2026-11-02T20:56:00Z', now)).toBe('4 min ago');
    expect(formatAge('2026-11-02T18:00:00Z', now)).toBe('3 h ago');
    expect(formatAge(null, now)).toBe('unknown');
  });
});

import { ARCTIC_PLACES, isIceland } from '../geo';
describe('regions', () => {
  it('every Iceland base is in Iceland, no Arctic base is', () => {
    expect(ICELAND_PLACES.every((p) => isIceland(p.lat, p.lon))).toBe(true);
    expect(ARCTIC_PLACES.some((p) => isIceland(p.lat, p.lon))).toBe(false);
  });
  it('covers Norway, Finland, Greenland, Canada and Alaska', () => {
    expect(new Set(ARCTIC_PLACES.map((p) => p.region))).toEqual(new Set(['Norway', 'Sweden', 'Finland', 'Greenland', 'Canada', 'Alaska']));
  });
});
