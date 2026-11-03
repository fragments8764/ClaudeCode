import { describe, expect, it } from 'vitest';
import omGrid from './fixtures/open-meteo-grid.json';
import roadSt from './fixtures/road-stations.json';
import roadCond from './fixtures/road-conditions.json';
import ceilo from './fixtures/imo-ceilometer.json';
import imoSt from './fixtures/imo-stations.json';
import naq from './fixtures/gin-naq.json';
import {
  auroraElevationDeg,
  auroraHorizonKm,
  bearingDeg,
  brightnessFrom,
  driveMinutes,
  evaluateAlerts,
  expectation,
  gridValueAt,
  groundBay,
  inQuietHours,
  lightPollutionFactor,
  mapsLinks,
  nightPolygon,
  npfSeconds,
  parseCapWarnings,
  parseCeilometer,
  parseGinMag,
  parseOpenMeteoGrid,
  parseRoadConditions,
  parseRoadStations,
  pointInPolygon,
  predictArc,
  rankSpots,
  roadSeverity,
  roadsNear,
  rule500Seconds,
  substormNowcast,
  suggestExposure,
  sunAltitudeDeg,
  timeIndex,
  type AlertState,
  type ImfPoint,
  type Spot,
  type ValueGrid,
} from '../index';

const RVK = { lat: 64.1466, lon: -21.9426 };

describe('cloud grid', () => {
  const g = parseOpenMeteoGrid(omGrid, [63.5, 64], [-20, -19]);
  it('parses multi-location into time × point', () => {
    expect(g.times.length).toBe(6);
    expect(g.values[0]!.length).toBe(4);
  });
  it('bilinear interpolation stays within corner range, null outside', () => {
    const v = gridValueAt(g, 0, 63.75, -19.5)!;
    const corners = g.values[0]!.filter((x): x is number => x !== null);
    expect(v).toBeGreaterThanOrEqual(Math.min(...corners) - 1e-9);
    expect(v).toBeLessThanOrEqual(Math.max(...corners) + 1e-9);
    expect(gridValueAt(g, 0, 60, -19.5)).toBeNull();
  });
  it('exact corner returns that value', () => {
    expect(gridValueAt(g, 0, 63.5, -20)).toBe(g.values[0]![0]);
  });
  it('timeIndex picks the nearest hour', () => {
    expect(timeIndex(g, new Date(new Date(g.times[2]!).getTime() + 10 * 60_000))).toBe(2);
  });
  it('rejects mismatched point counts', () => {
    expect(() => parseOpenMeteoGrid(omGrid, [63.5], [-20])).toThrow();
  });
});

describe('night polygon (terminator)', () => {
  it('covers Iceland on a November night and sits where the sun is below −12°', () => {
    const t = new Date('2026-11-02T23:00:00Z');
    const ring = nightPolygon(t, -12)!;
    expect(ring.length).toBeGreaterThan(100);
    // every edge point that is not the pole cap should be near the −12° line
    const edges = ring.filter(([, lat]) => Math.abs(lat) < 84);
    for (const [lon, lat] of edges.slice(0, 40)) expect(sunAltitudeDeg(t, lat, lon)).toBeLessThan(-11);
  });
});

describe('geometry', () => {
  it('aurora elevation falls with distance, ~0° at the horizon distance', () => {
    expect(auroraElevationDeg(0)).toBe(90);
    expect(auroraElevationDeg(100)).toBeGreaterThan(auroraElevationDeg(400));
    expect(Math.abs(auroraElevationDeg(auroraHorizonKm()))).toBeLessThan(0.5);
    expect(auroraHorizonKm()).toBeGreaterThan(1100);
  });
  it('bearing north and east', () => {
    expect(bearingDeg({ lat: 64, lon: -20 }, { lat: 66, lon: -20 })).toBeCloseTo(0, 0);
    expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 0);
  });
  it('predictArc finds the oval to the north', () => {
    const pts: [number, number, number][] = [
      [62, -20, 2],
      [67, -20, 15],
      [70, -20, 30],
    ];
    const a = predictArc({ lat: 64, lon: -20 }, pts, 10)!;
    expect(a.distanceKm).toBeGreaterThan(300);
    expect(a.bearingDeg).toBeCloseTo(0, 0);
    expect(a.elevationDeg).toBeGreaterThan(5);
    expect(predictArc({ lat: 64, lon: -20 }, pts, 50)).toBeNull();
  });
});

describe('spots', () => {
  const spots: Spot[] = [
    { id: 'a', name: 'Near clear', region: '', lat: 64.0, lon: -20.0, bortle: 2, view: 'N', parking: '', shelter: '', notes: '' },
    { id: 'b', name: 'Near cloudy', region: '', lat: 64.0, lon: -21.0, bortle: 2, view: 'N', parking: '', shelter: '', notes: '' },
    { id: 'c', name: 'Far', region: '', lat: 66.0, lon: -16.0, bortle: 1, view: 'N', parking: '', shelter: '', notes: '' },
  ];
  const grid: ValueGrid = { lats: [63, 65, 67], lons: [-22, -20, -18, -16, -14], times: ['2026-11-02T23:00:00.000Z'], values: [[90, 0, 0, 0, 0, 90, 0, 0, 0, 0, 90, 0, 0, 0, 0]] };
  it('ranks clear spots first and respects radius', () => {
    const r = rankSpots(spots, { from: RVK, at: new Date('2026-11-02T23:00:00Z'), clouds: grid, timeIdx: 0, ovation: 15, kp: 3, bz: -3, speed: 450, maxKm: 150 });
    expect(r.map((x) => x.spot.id)).toEqual(['a', 'b']);
    expect(r[0]!.clearAndDark).toBe(true);
    expect(r[0]!.driveMin).toBeGreaterThan(30);
  });
  it('light pollution & drive helpers', () => {
    expect(lightPollutionFactor(1)).toBe(1);
    expect(lightPollutionFactor(8)).toBeLessThan(lightPollutionFactor(4));
    expect(driveMinutes(70)).toBe(81);
    expect(mapsLinks({ lat: 64, lon: -20 }, 'X').google).toContain('destination=64.00000,-20.00000');
  });
});

describe('Iceland sources', () => {
  it('road stations and conditions join by segment', () => {
    const st = parseRoadStations(roadSt);
    const cond = parseRoadConditions(roadCond);
    expect(st.length).toBeGreaterThan(10);
    expect(st[0]!.time).toMatch(/Z$/);
    expect(cond.length).toBeGreaterThan(10);
    const near = roadsNear(st[0]!, st, cond, 80);
    expect(near[0]!.distanceKm).toBe(0);
    expect(near.some((n) => n.conditions.length > 0)).toBe(true);
  });
  it('road severity', () => {
    expect(roadSeverity('GREIDFAERT', 'Easily passable')).toBe('ok');
    expect(roadSeverity('OFAERT', 'Impassable')).toBe('closed');
    expect(roadSeverity('HALKA', 'Slippery')).toBe('caution');
  });
  it('ceilometer obs joined with station coordinates', () => {
    const o = parseCeilometer(ceilo, imoSt);
    expect(o.length).toBeGreaterThan(0);
    expect(o.every((x) => x.oktas === null || (x.oktas >= 0 && x.oktas <= 8))).toBe(true);
  });
  it('CAP warnings parse defensively, incl. string polygons', () => {
    expect(parseCapWarnings(null)).toEqual([]);
    const w = parseCapWarnings([{ identifier: 'x', headline_en: 'Yellow: gale', severity: 'Moderate', onset: '2026-11-03T12:00:00', polygon: '63,-20 63,-18 65,-18 65,-20 63,-20' }]);
    expect(w[0]!.headline).toBe('Yellow: gale');
    expect(pointInPolygon({ lat: 64, lon: -19 }, w[0]!.polygon!)).toBe(true);
    expect(pointInPolygon({ lat: 66, lon: -19 }, w[0]!.polygon!)).toBe(false);
  });
});

describe('substorm nowcast', () => {
  const mk = (bz: number[]): ImfPoint[] => bz.map((v, i) => ({ time: new Date(Date.UTC(2026, 10, 2, 22, i)).toISOString(), bt: 10, bz: v }));
  it('quiet when Bz north', () => {
    expect(substormNowcast(mk(Array(60).fill(3)), [], null).level).toBe('quiet');
  });
  it('likely after ≥30 min of strongly south Bz', () => {
    const n = substormNowcast(mk([...Array(20).fill(2), ...Array(40).fill(-7)]), [], null);
    expect(n.level).toBe('likely');
    expect(n.southMinutes).toBeGreaterThanOrEqual(30);
  });
  it('loading for a short southward turn', () => {
    expect(substormNowcast(mk([...Array(45).fill(1), ...Array(15).fill(-3)]), [], null).level).toBe('loading');
  });
  it('ground magnetometer parses and an artificial bay triggers onset', () => {
    const g = parseGinMag(naq, 'NAQ');
    expect(g.series.length).toBeGreaterThan(100);
    const bayed = { ...g, series: g.series.map((p, i, a) => (i > a.length - 15 ? { ...p, x: p.x - 300 } : p)) };
    expect(groundBay(bayed).bay).toBeGreaterThanOrEqual(250);
    expect(substormNowcast(mk(Array(60).fill(1)), [], bayed).level).toBe('onset');
  });
});

describe('alerts', () => {
  const prefs = { minScore: 50, minKp: 4, bzSouth: true, quietStart: '02:00', quietEnd: '07:00', tz: 'Atlantic/Reykjavik' };
  const state: AlertState = { score: 62, dark: 1, cloud: 20, kpMaxNext3h: 4.3, bzAvg15: -9, nowcast: 'likely', clearingInHours: null, placeLabel: 'Vík' };
  const at = new Date('2026-11-02T22:00:00Z');
  it('fires score, substorm, bz and kp alerts outside quiet hours', () => {
    const rules = evaluateAlerts(state, prefs, {}, at).map((m) => m.rule).sort();
    expect(rules).toEqual(['bz-south', 'kp-forecast', 'score', 'substorm']);
  });
  it('respects cooldowns', () => {
    const r = evaluateAlerts(state, prefs, { score: '2026-11-02T21:00:00Z' }, at);
    expect(r.some((m) => m.rule === 'score')).toBe(false);
  });
  it('quiet hours suppress all but a real onset', () => {
    const night = new Date('2026-11-03T03:00:00Z');
    expect(inQuietHours(night, prefs)).toBe(true);
    expect(evaluateAlerts(state, prefs, {}, night)).toEqual([]);
    expect(evaluateAlerts({ ...state, nowcast: 'onset' }, prefs, {}, night).map((m) => m.rule)).toEqual(['substorm']);
  });
  it('wrapping quiet window', () => {
    const p = { quietStart: '23:00', quietEnd: '06:00', tz: 'UTC' };
    expect(inQuietHours(new Date('2026-11-02T23:30:00Z'), p)).toBe(true);
    expect(inQuietHours(new Date('2026-11-02T12:00:00Z'), p)).toBe(false);
  });
  it('cloud gap alert', () => {
    const r = evaluateAlerts({ ...state, score: 20, cloud: 90, bzAvg15: 0, nowcast: 'quiet', kpMaxNext3h: 2, clearingInHours: 1 }, prefs, {}, at);
    expect(r.map((m) => m.rule)).toEqual(['clearing']);
  });
});

describe('photography', () => {
  it('NPF and 500 rules', () => {
    expect(npfSeconds(14, 2.8)).toBeCloseTo(16.2, 1);
    expect(rule500Seconds(24)).toBeCloseTo(20.8, 1);
    expect(rule500Seconds(24, 1.5)).toBeLessThan(rule500Seconds(24));
  });
  it('brighter aurora → shorter shutter; never exceeds NPF', () => {
    const faint = suggestExposure(0, { focalMm: 24, aperture: 2.8, moonUpBright: false });
    const storm = suggestExposure(3, { focalMm: 24, aperture: 2.8, moonUpBright: false });
    expect(storm.shutter).toBeLessThan(faint.shutter);
    expect(faint.shutter).toBeLessThanOrEqual(npfSeconds(24, 2.8));
    expect(suggestExposure(1, { focalMm: 14, aperture: 2.8, moonUpBright: true }).iso).toBeLessThan(suggestExposure(1, { focalMm: 14, aperture: 2.8, moonUpBright: false }).iso);
  });
  it('brightness & expectations', () => {
    expect(brightnessFrom(2, 10)).toBe(0);
    expect(brightnessFrom(7, null)).toBe(3);
    expect(expectation(0).eye).toMatch(/grey/i);
  });
});
