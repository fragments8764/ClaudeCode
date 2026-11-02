import { describe, expect, it } from 'vitest';
import { scoreColor, PALETTE } from './tokens';
import { skyParams } from '../sky/skyParams';

describe('score colour ramp', () => {
  it('runs grey → teal → green → magenta', () => {
    expect(scoreColor(0)).toEqual(PALETTE.grey);
    expect(scoreColor(25)).toEqual(PALETTE.teal);
    expect(scoreColor(55)).toEqual(PALETTE.emerald);
    expect(scoreColor(100)).toEqual(PALETTE.magenta);
    expect(scoreColor(-5)).toEqual(PALETTE.grey);
  });
});

describe('sky parameters', () => {
  const base = { kp: 2, bz: 0, speed: 400, score: null, darkness: 1 };
  it('intensity rises with Kp and south Bz, and is calmer in daylight', () => {
    expect(skyParams({ ...base, kp: 6 }).intensity).toBeGreaterThan(skyParams(base).intensity);
    expect(skyParams({ ...base, bz: -10 }).intensity).toBeGreaterThan(skyParams(base).intensity);
    expect(skyParams({ ...base, darkness: 0 }).intensity).toBeLessThan(skyParams(base).intensity);
  });
  it('fast wind / south Bz make curtains move faster', () => {
    expect(skyParams({ ...base, speed: 700 }).speed).toBeGreaterThan(skyParams(base).speed);
    expect(skyParams({ ...base, bz: -10 }).speed).toBeGreaterThan(skyParams(base).speed);
  });
  it('the score floors intensity', () => {
    expect(skyParams({ ...base, score: 90 }).intensity).toBeGreaterThanOrEqual(0.9);
  });
  it('storm tops shift away from teal', () => {
    expect(skyParams({ ...base, kp: 8 }).colC).not.toEqual(skyParams(base).colC);
  });
});
