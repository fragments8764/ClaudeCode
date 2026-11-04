import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { banner, checkConfig } from './lib/configCheck';

const dir = mkdtempSync(join(tmpdir(), 'nl-cfg-'));
const FULL = { RENDER: 'true', DATA_DIR: dir, VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'k', VAPID_SUBJECT: 'mailto:a@b.is', ADMIN_TOKEN: 'x'.repeat(32), OPEN_METEO_API_KEY: 'om', CONTACT_EMAIL: 'a@b.is', ROUTING_PROVIDER: 'osrm', OSRM_URL: 'http://osrm:5000' };

describe('production settings check', () => {
  it('is quiet when everything is set', () => {
    expect(checkConfig(FULL, { dataDir: dir, dataDirDefaulted: false })).toEqual([]);
    expect(banner([])).toMatch(/all good/);
  });
  it('flags data loss on Render without a disk as an error', () => {
    const r = checkConfig({ ...FULL, DATA_DIR: undefined }, { dataDir: dir, dataDirDefaulted: true });
    expect(r.find((i) => i.key === 'DATA_DIR')?.level).toBe('error');
  });
  it('missing VAPID keys are an error in production, a warning in dev', () => {
    const env = { ...FULL, VAPID_PUBLIC_KEY: undefined };
    expect(checkConfig(env, { dataDir: dir, dataDirDefaulted: false }).find((i) => i.key === 'VAPID_PUBLIC_KEY')?.level).toBe('error');
    expect(checkConfig({ ...env, RENDER: undefined }, { dataDir: dir, dataDirDefaulted: false }).find((i) => i.key === 'VAPID_PUBLIC_KEY')?.level).toBe('warn');
  });
  it('warns about a missing or short admin token and the free Open-Meteo tier', () => {
    const r = checkConfig({ ...FULL, ADMIN_TOKEN: 'short', OPEN_METEO_API_KEY: undefined }, { dataDir: dir, dataDirDefaulted: false });
    expect(r.map((i) => i.key).sort()).toEqual(['ADMIN_TOKEN', 'OPEN_METEO_API_KEY']);
    expect(banner(r)).toMatch(/0 error\(s\), 2 warning\(s\)/);
  });
});
