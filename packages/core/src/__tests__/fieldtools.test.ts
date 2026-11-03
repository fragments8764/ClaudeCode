import { describe, expect, it } from 'vitest';
import { buildChecklist, checklistDay, suggestFromShots, type ShotEntry } from '../index';

const base = { feelsLikeC: 2, airC: 5, gustMs: 6, driving: false, driveMin: null, hasCamera: false, iceRisk: false, darkHours: 12 };

describe('checklist', () => {
  it('always has the essentials', () => {
    const ids = buildChecklist(base).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['layers', 'headlamp', 'phone', 'powerbank', 'boots']));
    expect(ids).not.toContain('tripod');
    expect(ids).not.toContain('fuel');
  });
  it('adapts to cold, wind, ice, camera and driving', () => {
    const items = buildChecklist({ ...base, feelsLikeC: -12, airC: -4, gustMs: 18, iceRisk: true, hasCamera: true, driving: true, driveMin: 90 });
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by.layers!.label).toMatch(/Thermal/);
    expect(by.shell!.why).toBe('Gusts 18 m/s');
    expect(by.spikes).toBeDefined();
    expect(by.tripod).toBeDefined();
    expect(by.fuel!.why).toBe('90 min drive each way');
    expect(by.plan!.essential).toBe(true);
  });
  it('resets daily, but a post-midnight check still belongs to the evening', () => {
    expect(checklistDay(new Date(2026, 10, 3, 2, 0))).toBe('2026-11-02');
    expect(checklistDay(new Date(2026, 10, 3, 20, 0))).toBe('2026-11-03');
  });
});

describe('shot log suggestions', () => {
  const shot = (p: Partial<ShotEntry>): ShotEntry => ({ id: Math.random().toString(), at: '', iso: 1600, shutter: 8, aperture: 2.8, focalMm: 14, brightness: 1, rating: 'good', score: null, kp: null, cloud: null, moonIllumination: null, note: '', photoKey: null, ...p });
  it('needs at least 2 good shots', () => {
    expect(suggestFromShots([shot({})], 1)).toBeNull();
    expect(suggestFromShots([shot({}), shot({ rating: 'bad' })], 1)).toBeNull();
  });
  it('medians good shots at the same brightness, then neighbours', () => {
    const s = suggestFromShots([shot({ iso: 1600, shutter: 6 }), shot({ iso: 3200, shutter: 10 }), shot({ iso: 800, shutter: 2, brightness: 3 })], 1)!;
    expect(s).toMatchObject({ iso: 2500, shutter: 8, basedOn: 2 });
    const n = suggestFromShots([shot({ brightness: 2 }), shot({ brightness: 2, iso: 1250 })], 3)!;
    expect(n.basedOn).toBe(2);
    expect(n.note).toMatch(/similar brightness/);
  });
});
