import { describe, expect, it } from 'vitest';
import kpObs from './fixtures/noaa-kp.json';
import kpFc from './fixtures/noaa-kp-forecast.json';
import wind from './fixtures/rtsw-wind.json';
import mag from './fixtures/rtsw-mag.json';
import om from './fixtures/open-meteo.json';
import metno from './fixtures/metno-complete.json';
import {
  bucketAverage,
  combineClouds,
  effectiveCloud,
  isoUtc,
  kpToGScale,
  latestAtOrBefore,
  parseKpForecast,
  parseKpObserved,
  parseMetNo,
  parseOpenMeteo,
  parseRtswMag,
  parseRtswWind,
  ParseError,
} from '../index';

describe('isoUtc', () => {
  it('normalises the different upstream formats', () => {
    expect(isoUtc('2026-11-02T21:00:00')).toBe('2026-11-02T21:00:00.000Z');
    expect(isoUtc('2026-11-02 12:03:53.987')).toBe('2026-11-02T12:03:53.987Z');
    expect(isoUtc('2026-11-02T21:15')).toBe('2026-11-02T21:15:00.000Z');
    expect(isoUtc('2026-11-02T21:00:00Z')).toBe('2026-11-02T21:00:00.000Z');
    expect(isoUtc('garbage')).toBeNull();
    expect(isoUtc(42)).toBeNull();
  });
});

describe('NOAA Kp', () => {
  it('parses current object format', () => {
    const kp = parseKpObserved(kpObs);
    expect(kp.length).toBeGreaterThan(20);
    expect(kp[0]!.time < kp[kp.length - 1]!.time).toBe(true);
    expect(kp.every((p) => p.kp >= 0 && p.kp <= 9)).toBe(true);
  });
  it('accepts legacy array-of-arrays format', () => {
    const legacy = [
      ['time_tag', 'Kp', 'a_running', 'station_count'],
      ['2024-05-10 18:00:00.000', '8.67', '300', '8'],
    ];
    expect(parseKpObserved(legacy)).toEqual([{ time: '2024-05-10T18:00:00.000Z', kp: 8.67, kind: 'observed', scale: null }]);
  });
  it('forecast distinguishes observed/estimated/predicted', () => {
    const f = parseKpForecast(kpFc);
    const kinds = new Set(f.map((p) => p.kind));
    expect(kinds.has('observed')).toBe(true);
    expect(kinds.has('predicted')).toBe(true);
  });
  it('throws ParseError on junk', () => {
    expect(() => parseKpObserved({})).toThrow(ParseError);
    expect(() => parseKpObserved([])).toThrow(ParseError);
  });
  it('kpToGScale', () => {
    expect(kpToGScale(4.67)).toBe(0);
    expect(kpToGScale(5)).toBe(1);
    expect(kpToGScale(7.33)).toBe(3);
    expect(kpToGScale(9)).toBe(5);
  });
  it('latestAtOrBefore skips future points', () => {
    const f = parseKpForecast(kpFc);
    const p = latestAtOrBefore(f, new Date('2026-11-02T21:30:00Z'));
    expect(p!.time).toBe('2026-11-02T21:00:00.000Z');
  });
});

describe('RTSW solar wind / IMF', () => {
  it('uses only the active spacecraft', () => {
    const w = parseRtswWind(wind);
    expect(w.spacecraft).toBe('SOLAR1');
    expect(w.series.length).toBeGreaterThan(0);
    const m = parseRtswMag(mag);
    expect(m.spacecraft).toBe('SOLAR1');
    expect(m.series.every((p) => p.bt === null || p.bt >= 0)).toBe(true);
  });
  it('falls back to all records when none are active', () => {
    const rows = [
      { time_tag: '2026-11-02T21:00:00', active: false, source: 'ACE', proton_speed: 400, proton_density: 5 },
      { time_tag: '2026-11-02T21:01:00', active: false, source: 'IMAP', proton_speed: 410, proton_density: null },
    ];
    const w = parseRtswWind(rows);
    expect(w.spacecraft).toBeNull();
    expect(w.series.map((p) => p.speed)).toEqual([400, 410]);
  });
  it('bucketAverage downsamples', () => {
    const s = [
      { time: '2026-11-02T21:00:00Z', bz: -2, bt: 4 },
      { time: '2026-11-02T21:03:00Z', bz: -4, bt: null },
      { time: '2026-11-02T21:06:00Z', bz: 1, bt: 3 },
    ];
    const b = bucketAverage(s, 5, ['bz', 'bt']);
    expect(b).toEqual([
      { time: '2026-11-02T21:00:00.000Z', bz: -3, bt: 4 },
      { time: '2026-11-02T21:05:00.000Z', bz: 1, bt: 3 },
    ]);
  });
});

describe('clouds', () => {
  it('parses Open-Meteo current + hourly layers', () => {
    const f = parseOpenMeteo(om);
    expect(f.current).toMatchObject({ total: 100, low: 100, mid: 100, high: 70 });
    expect(f.hourly.length).toBe(48);
  });
  it('parses MET Norway complete layers', () => {
    const f = parseMetNo(metno, new Date('2026-11-02T21:10:00Z'));
    expect(f.current).toMatchObject({ total: 100, low: 100, mid: 100, high: 82 });
    expect(f.hourly.length).toBeGreaterThan(10);
  });
  it('MET Norway current is null when data is too old', () => {
    expect(parseMetNo(metno, new Date('2027-01-01T00:00:00Z')).current).toBeNull();
  });
  it('effectiveCloud discounts thin high cloud', () => {
    expect(effectiveCloud({ total: 80, low: 0, mid: 0, high: 80 })).toBe(40);
    expect(effectiveCloud({ total: 100, low: 100, mid: 0, high: 0 })).toBe(100);
    expect(effectiveCloud({ total: 0, low: 0, mid: 0, high: 0 })).toBe(0);
    expect(effectiveCloud({ total: 55, low: null, mid: null, high: null })).toBe(55);
  });
  it('combineClouds rates agreement', () => {
    const mk = (source: 'open-meteo' | 'met-norway', total: number) => ({
      source,
      current: { time: '2026-11-02T21:00:00.000Z', total, low: total, mid: 0, high: 0 },
      hourly: [{ time: '2026-11-02T22:00:00.000Z', total, low: total, mid: 0, high: 0 }],
    });
    expect(combineClouds([mk('open-meteo', 20), mk('met-norway', 30)]).confidence).toBe('high');
    expect(combineClouds([mk('open-meteo', 20), mk('met-norway', 50)]).confidence).toBe('medium');
    const low = combineClouds([mk('open-meteo', 0), mk('met-norway', 90)]);
    expect(low.confidence).toBe('low');
    expect(low.current!.total).toBe(45);
    expect(low.hourly[0]!.total).toBe(45);
    expect(combineClouds([mk('open-meteo', 10), null]).confidence).toBe('single-source');
    expect(combineClouds([null, null]).confidence).toBe('none');
  });
});
