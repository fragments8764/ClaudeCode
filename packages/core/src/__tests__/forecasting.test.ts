import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import om6 from './fixtures/open-meteo-6day.json';
import kpFc from './fixtures/noaa-kp-forecast.json';
import { findCloudGaps, fiveNightOutlook, moonImpact, parse27Day, parseKpForecast, parseOpenMeteo, type Spot, type ValueGrid } from '../index';

const spot = (id: string, lat: number, lon: number, bortle = 2): Spot => ({ id, name: id, region: '', lat, lon, bortle, view: 'N', parking: '', shelter: '', notes: '' });
const RVK = { lat: 64.15, lon: -21.94 };
// Synthetic grid: 63–67°N × −24…−14°E, 12 hours from 18:00 UTC. West overcast all night; east clears from 22:00.
const times = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 10, 2, 18 + i)).toISOString());
const lats = [63, 64, 65, 66, 67];
const lons = [-24, -22, -20, -18, -16, -14];
const grid: ValueGrid = {
  lats,
  lons,
  times,
  values: times.map((t) => lats.flatMap(() => lons.map((lo) => (lo >= -20 && (new Date(t).getUTCHours() >= 22 || new Date(t).getUTCHours() < 6) ? 5 : 95)))),
};

describe('cloud-gap hunter', () => {
  it('finds the clearing to the east, with leave time and summary', () => {
    const now = new Date('2026-11-02T20:00:00Z');
    const gaps = findCloudGaps({ from: RVK, now, grid, spots: [spot('Vík', 63.42, -19.0), spot('Grótta', 64.16, -22.02)], maxDriveMin: 240 });
    expect(gaps.map((g) => g.spot.id)).toEqual(['Vík']);
    const g = gaps[0]!;
    expect(g.clearAt).toBe('2026-11-02T22:00:00.000Z'); // sky clears at 22:00…
    expect(new Date(g.arriveAt).getTime()).toBe(now.getTime() + g.driveMin * 60_000); // …but you can only get there after the drive
    expect(g.driveMin).toBeGreaterThan(100);
    expect(new Date(g.leaveAt).getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(new Date(g.backAt).getTime()).toBeGreaterThan(new Date(g.clearUntil).getTime());
    expect(g.hours).toBeGreaterThanOrEqual(2);
    expect(g.summary).toMatch(/^Clearing near Vík at 22:00\. \d h \d\d min drive\. Leave now\.$/);
    // durations use non-breaking spaces so "3 h 12 min" never wraps mid-way (regression: text crowding)
    expect(g.summary).not.toMatch(/\d [hm]/);
  });
  it('skips a gap that closes before you could get there', () => {
    const short = { ...grid, values: grid.values.map((r, i) => (new Date(grid.times[i]!).getUTCHours() === 22 ? r : r.map(() => 95))) };
    expect(findCloudGaps({ from: RVK, now: new Date('2026-11-02T20:00:00Z'), grid: short, spots: [spot('Vík', 63.42, -19.0)], maxDriveMin: 240 })).toEqual([]);
  });
  it('respects max drive time and returns nothing when everything is cloudy', () => {
    const now = new Date('2026-11-02T20:00:00Z');
    expect(findCloudGaps({ from: RVK, now, grid, spots: [spot('Vík', 63.42, -19.0)], maxDriveMin: 60 })).toEqual([]);
    const cloudy = { ...grid, values: grid.values.map((r) => r.map(() => 90)) };
    expect(findCloudGaps({ from: RVK, now, grid: cloudy, spots: [spot('Vík', 63.42, -19.0)] })).toEqual([]);
  });
  it('a long, very clear window is high confidence', () => {
    const clear = { ...grid, values: grid.values.map((r) => r.map(() => 5)) };
    const g = findCloudGaps({ from: RVK, now: new Date('2026-11-02T20:00:00Z'), grid: clear, spots: [spot('near', 64.2, -21.5)] })[0]!;
    expect(g.confidence).toBe('high');
    expect(g.summary).toMatch(/^Clear near near now\. \d+ min drive\. Leave now\.$/);
  });
});

describe('5-night outlook', () => {
  const kp27 = parse27Day(readFileSync(new URL('./fixtures/noaa-27day.txt', import.meta.url), 'utf8'));
  it('parses the NOAA 27-day outlook', () => {
    expect(kp27.length).toBeGreaterThanOrEqual(27);
    expect(kp27[0]).toEqual({ date: '2026-11-02', kp: 3 });
  });
  it('builds 5 nights with windows, cloud trend, moon, Kp source and one best pick', () => {
    const hourly = parseOpenMeteo(om6).hourly;
    const now = new Date(hourly[0]!.time);
    const out = fiveNightOutlook({ lat: 64.15, lon: -21.95, now, hourly, kp3day: parseKpForecast(kpFc), kp27 });
    expect(out).toHaveLength(5);
    expect(out.filter((n) => n.best).length).toBeLessThanOrEqual(1);
    for (const n of out) {
      expect(n.score).toBeGreaterThanOrEqual(0);
      expect(['none', 'low', 'moderate', 'high']).toContain(n.moon.label);
      expect(n.darkHours).toBeGreaterThan(8); // November in Reykjavík
    }
    expect(out.some((n) => n.kpSource === '27-day')).toBe(true); // nights beyond NOAA's 3-day
  });
  it('moonImpact is 0 when the moon is down all window', () => {
    expect(moonImpact('2026-11-02T10:00:00Z', '2026-11-02T09:00:00Z', 64, -21)).toBe(0);
  });
});

describe('outlook edge cases', () => {
  it('a fully overcast night has no best window and score 0', () => {
    const hourly = Array.from({ length: 48 }, (_, i) => ({ time: new Date(Date.UTC(2026, 10, 2, 12 + i)).toISOString(), total: 100, low: 100, mid: 100, high: 100 }));
    const out = fiveNightOutlook({ lat: 64.15, lon: -21.95, now: new Date('2026-11-02T13:00:00Z'), hourly, kp3day: [], kp27: [], nights: 1 });
    expect(out[0]!.score).toBe(0);
    expect(out[0]!.window).toBeNull();
    expect(out[0]!.best).toBe(false);
  });
});
