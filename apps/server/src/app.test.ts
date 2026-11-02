import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp, UPSTREAM } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../../../packages/core/src/__tests__/fixtures/${n}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-11-02T21:30:00Z');

function makeApp(routes: Record<string, unknown | Error>) {
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    const body = key ? routes[key] : undefined;
    if (!key || body instanceof Error) return new Response('down', { status: 503 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const fetcher = new Fetcher(SOURCES, { fetch: fetch as typeof globalThis.fetch, retries: 0, sleep: async () => {} });
  return createApp({ fetcher, now: () => NOW });
}

const ALL = {
  [UPSTREAM.kp]: fx('noaa-kp.json'),
  [UPSTREAM.kpForecast]: fx('noaa-kp-forecast.json'),
  [UPSTREAM.rtswWind]: fx('rtsw-wind.json'),
  [UPSTREAM.rtswMag]: fx('rtsw-mag.json'),
  'https://api.open-meteo.com/': fx('open-meteo.json'),
  'https://api.met.no/': fx('metno-complete.json'),
};

describe('API', () => {
  it('GET /api/space-weather aggregates NOAA feeds', async () => {
    const res = await makeApp(ALL).request('/api/space-weather');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kp.now.time).toBe('2026-11-02T21:00:00.000Z');
    expect(body.data.solarWind.spacecraft).toBe('SOLAR1');
    expect(body.data.solarWind.latest.speed).toBeGreaterThan(200);
    expect(typeof body.data.solarWind.latest.bz).toBe('number');
    expect(body.data.solarWind.mag6h.length).toBeGreaterThan(0);
    expect(body.meta.sources.every((s: { ok: boolean }) => s.ok)).toBe(true);
  });

  it('space-weather degrades gracefully when a feed is down', async () => {
    const res = await makeApp({ ...ALL, [UPSTREAM.rtswMag]: new Error() }).request('/api/space-weather');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.kp.now).not.toBeNull();
    const mag = body.meta.sources.find((s: { id: string }) => s.id === 'noaa-rtsw-mag');
    expect(mag.ok).toBe(false);
  });

  it('GET /api/clouds validates input', async () => {
    const res = await makeApp(ALL).request('/api/clouds?lat=abc&lon=1');
    expect(res.status).toBe(400);
  });

  it('GET /api/clouds cross-checks two sources and snaps coordinates', async () => {
    const res = await makeApp(ALL).request('/api/clouds?lat=64.1466&lon=-21.9426');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.location).toEqual({ lat: 64.15, lon: -21.95 });
    expect(body.data.current.total).toBe(100);
    expect(body.data.confidence).toBe('high');
    expect(body.data.weather.windGust).toBe(59);
    expect(body.data.hourly.length).toBeGreaterThan(0);
  });

  it('clouds falls back to a single source', async () => {
    const res = await makeApp({ ...ALL, 'https://api.open-meteo.com/': new Error() }).request('/api/clouds?lat=64.15&lon=-21.95');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.confidence).toBe('single-source');
  });

  it('clouds returns 503 when all sources are down', async () => {
    const res = await makeApp({}).request('/api/clouds?lat=64.15&lon=-21.95');
    expect(res.status).toBe(503);
  });

  it('GET /api/health reports per-source status', async () => {
    const app = makeApp({});
    await app.request('/api/space-weather');
    const body = await (await app.request('/api/health')).json();
    expect(body.status).toBe('degraded');
    expect(body.sources.find((s: { id: string }) => s.id === 'noaa-kp').lastError).toContain('503');
  });
});
