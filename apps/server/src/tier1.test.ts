import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp, UPSTREAM } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../../../packages/core/src/__tests__/fixtures/${n}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-11-02T23:30:00Z');

function makeApp(routes: Record<string, unknown | Error>, extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((k) => url.startsWith(k));
    const body = key ? routes[key] : undefined;
    if (!key || body instanceof Error) return new Response('down', { status: 503 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const fetcher = new Fetcher(SOURCES, { fetch: fetch as typeof globalThis.fetch, retries: 0, sleep: async () => {} });
  return createApp({ fetcher, now: () => NOW, inlineConfig: { spots: [], cameras: [], weights: { OVATION_FULL: 25 } }, adminToken: 'secret', ...extra });
}
const ALL = {
  [UPSTREAM.kp]: fx('noaa-kp.json'),
  [UPSTREAM.kpForecast]: fx('noaa-kp-forecast.json'),
  [UPSTREAM.rtswWind]: fx('rtsw-wind.json'),
  [UPSTREAM.rtswMag]: fx('rtsw-mag.json'),
  [UPSTREAM.ovation]: fx('ovation.json'),
  'https://api.met.no/': fx('metno-complete.json'),
  'https://api.open-meteo.com/': fx('open-meteo.json'),
};

describe('data health', () => {
  it('reports idle → ok, and down/stale with failures', async () => {
    const app = makeApp({ ...ALL, 'https://api.open-meteo.com/': new Error() });
    let h = await (await app.request('/api/health')).json();
    expect(h.sources.find((s: { id: string }) => s.id === 'noaa-kp').state).toBe('idle');
    await app.request('/api/clouds?lat=64.15&lon=-21.95');
    h = await (await app.request('/api/health')).json();
    const by = (id: string) => h.sources.find((s: { id: string }) => s.id === id);
    expect(by('met-norway').state).toBe('ok');
    expect(by('open-meteo').state).toBe('down');
    expect(by('open-meteo').provider).toBe('Open-Meteo');
    expect(by('open-meteo').expectedRefreshSec).toBe(600);
    expect(h.status).toBe('degraded');
  });
  it('clouds response names the fallback in use and carries ttlSec', async () => {
    const b = await (await makeApp({ ...ALL, 'https://api.open-meteo.com/': new Error() }).request('/api/clouds?lat=64.15&lon=-21.95')).json();
    expect(b.data.fallback).toMatch(/MET Norway only/);
    expect(b.meta.sources[1].ttlSec).toBe(900);
  });
});

describe('score validation', () => {
  it('weights come from config and are versioned in /api/score', async () => {
    const app = makeApp(ALL);
    expect((await (await app.request('/api/score-weights')).json()).data.weights.OVATION_FULL).toBe(25);
    const s = await (await app.request('/api/score?lat=64.15&lon=-21.95')).json();
    expect(s.data.weightsVersion).toBe('inline');
    expect(app.services.stores.scoreLog.get()).toHaveLength(1);
    // dedupe within 15 min per ~10 km cell
    await app.request('/api/score?lat=64.16&lon=-21.96');
    expect(app.services.stores.scoreLog.get()).toHaveLength(1);
  });
  it('outcomes join with the logged peak score for that night', async () => {
    const app = makeApp(ALL);
    await app.request('/api/score?lat=64.15&lon=-21.95');
    const logged = app.services.stores.scoreLog.get()[0]!;
    const r = await app.request('/api/outcomes', { method: 'POST', body: JSON.stringify({ night: '2026-11-02', lat: 64.15, lon: -21.95, saw: true, predicted: 99 }) });
    expect(r.status).toBe(201);
    const o = (await r.json()).data;
    expect(o.predicted).toBe(logged.score);
    expect(o.predictedFrom).toBe('server-log');
    expect((await app.request('/api/outcomes', { method: 'POST', body: JSON.stringify({ night: 'x', lat: 1, lon: 1, saw: 'yes' }) })).status).toBe(400);
  });
  it('admin dashboard requires the token', async () => {
    const app = makeApp(ALL);
    expect((await app.request('/admin')).status).toBe(404);
    expect((await app.request('/api/admin/validation?token=nope')).status).toBe(404);
    const ok = await app.request('/admin?token=secret');
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('Score validation');
    const j = await (await app.request('/api/admin/validation', { headers: { authorization: 'Bearer secret' } })).json();
    expect(j.data.calibration.buckets).toHaveLength(5);
  });
  it('admin is disabled entirely without ADMIN_TOKEN', async () => {
    expect((await makeApp(ALL, { adminToken: null }).request('/admin?token=')).status).toBe(404);
  });
});
