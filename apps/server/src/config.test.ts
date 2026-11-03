import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigLoader } from './lib/config';

describe('ConfigLoader', () => {
  it('reads several keys from one file independently (regression: per-file cache returned the wrong key)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nl-cfg-'));
    writeFileSync(join(dir, 'score-weights.json'), JSON.stringify({ version: 'v-test', weights: { OVATION_FULL: 33 } }));
    const c = new ConfigLoader(dir);
    expect(c.weights()).toMatchObject({ version: 'v-test', weights: { OVATION_FULL: 33 } });
    expect(c.weights().version).toBe('v-test');
    expect(c.spots()).toEqual([]); // missing file → empty, no crash
    expect(c.features()).toEqual({});
  });
});
