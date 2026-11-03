import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ICELAND_GRID } from '@nordurljos/core';
import { createApp, UPSTREAM } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';
import { UP2, type PushSub } from './routes/extras';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../../../packages/core/src/__tests__/fixtures/${n}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-11-02T21:30:00Z');

const grid4 = fx('open-meteo-grid.json') as unknown[];
const grid117 = Array.from({ length: ICELAND_GRID.lats.length * ICELAND_GRID.lons.length }, (_, i) => grid4[i % 4]);
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

type Body = unknown | Error | (() => Response);
function makeApp(routes: Record<string, Body>, extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => url.startsWith(k));
    const body = key ? routes[key] : undefined;
    if (!key || body instanceof Error) return new Response('down', { status: 503 });
    if (typeof body === 'function') return (body as () => Response)();
    if (body === null) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const fetcher = new Fetcher(SOURCES, { fetch: fetch as typeof globalThis.fetch, retries: 0, sleep: async () => {} });
  return createApp({
    fetcher,
    now: () => NOW,
    inlineConfig: {
      spots: [{ id: 'x', name: 'Spot', region: 'R', lat: 64, lon: -20, bortle: 2, view: 'N', parking: '', shelter: '', notes: '' }],
      cameras: [
        { id: 'sky', name: 'Sky cam', region: 'R', country: 'NO', lat: 69.6, lon: 19, kind: 'allsky', embed: 'image', imageUrl: 'https://cam.example/sky.png', pageUrl: 'https://cam.example', attribution: 'Uni', refreshMin: 3 },
        { id: 'link', name: 'Link cam', region: 'R', country: 'IS', lat: 64.1, lon: -21.9, kind: 'town', embed: 'link', pageUrl: 'https://link.example', attribution: 'Míla' },
      ],
    },
    vapid: { publicKey: 'PUB', privateKey: 'PRIV', subject: 'https://example.org' },
    ...extra,
  });
}

const ALL: Record<string, Body> = {
  [UPSTREAM.kp]: fx('noaa-kp.json'),
  [UPSTREAM.kpForecast]: fx('noaa-kp-forecast.json'),
  [UPSTREAM.rtswWind]: fx('rtsw-wind.json'),
  [UPSTREAM.rtswMag]: fx('rtsw-mag.json'),
  [UPSTREAM.ovation]: fx('ovation.json'),
  'https://api.met.no/': fx('metno-complete.json'),
  'https://api.open-meteo.com/v1/forecast?latitude=63,63,': grid117,
  'https://api.open-meteo.com/v1/forecast?latitude=69.6,64.1': [{ current: { cloud_cover: 12 } }, { current: { cloud_cover: 95 } }],
  'https://api.open-meteo.com/': fx('open-meteo.json'),
  'https://cam.example/sky.png': () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
  [UP2.cap]: null,
  [UP2.roadWeather]: fx('road-stations.json'),
  [UP2.roadCond]: fx('road-conditions.json'),
  [UP2.ceilo]: fx('imo-ceilometer.json'),
  [UP2.imoStations]: fx('imo-stations.json'),
  [UP2.kp1m]: [{ time_tag: '2026-11-02T21:29:00', estimated_kp: 2.33 }],
  'https://imag-data.bgs.ac.uk/': new Error('down'),
};

describe('map data', () => {
  it('cloud grid for Iceland', async () => {
    const res = await makeApp(ALL).request('/api/grid/clouds');
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.data.lats).toEqual(ICELAND_GRID.lats);
    expect(b.data.values[0].length).toBe(117);
  });
  it('OVATION grid 45–85°N', async () => {
    const b = await (await makeApp(ALL).request('/api/grid/ovation')).json();
    expect(b.data.values.length).toBe(41 * 360);
  });
  it('spots from config', async () => {
    const b = await (await makeApp(ALL).request('/api/spots')).json();
    expect(b.data[0].id).toBe('x');
  });
});

describe('cameras', () => {
  it('lists cameras with status, cloud and image proxy URL (never the upstream URL)', async () => {
    const b = await (await makeApp(ALL).request('/api/cameras')).json();
    const sky = b.data.find((c: { id: string }) => c.id === 'sky');
    expect(sky.status).toBe('live');
    expect(sky.image).toBe('/api/cameras/sky/image');
    expect(sky.imageUrl).toBeUndefined();
    expect(sky.cloudNow).toBe(12);
    expect(b.data.find((c: { id: string }) => c.id === 'link').status).toBe('link');
  });
  it('proxies the image and records timelapse frames', async () => {
    const app = makeApp(ALL);
    const res = await app.request('/api/cameras/sky/image');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    const frames = await (await app.request('/api/cameras/sky/frames')).json();
    expect(frames.data.length).toBe(1);
    expect((await app.request('/api/cameras/sky/frames/0')).status).toBe(200);
    expect((await app.request('/api/cameras/link/image')).status).toBe(404);
  });
  it('rejects non-image upstream responses', async () => {
    const res = await makeApp({ ...ALL, 'https://cam.example/sky.png': () => new Response('<html>', { headers: { 'content-type': 'text/html' } }) }).request('/api/cameras/sky/image');
    expect(res.status).toBe(502);
  });
});

describe('safety, clear-now, nowcast', () => {
  it('safety: no warnings (204) + nearby roads', async () => {
    const b = await (await makeApp(ALL).request('/api/safety?lat=63.86&lon=-21.37')).json();
    expect(b.data.warnings).toEqual([]);
    expect(b.data.roads.length).toBeGreaterThan(0);
  });
  it('clear-now: nearest ceilometer, model, camera', async () => {
    const b = await (await makeApp(ALL).request('/api/clear-now?lat=64.13&lon=-21.9')).json();
    expect(b.data.model).not.toBeNull();
    expect(b.data.camera.id).toBe('link');
  });
  it('nowcast works without the ground magnetometer', async () => {
    const b = await (await makeApp(ALL).request('/api/nowcast')).json();
    expect(['quiet', 'loading', 'likely', 'onset']).toContain(b.data.level);
    expect(b.data.ground).toBeNull();
    expect(b.data.kpEstimate.kp).toBe(2.33);
  });
});

describe('sightings', () => {
  const post = (app: ReturnType<typeof makeApp>, body: unknown, ip = '1.1.1.1') =>
    app.request('/api/sightings', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', 'x-forwarded-for': ip } });
  it('validates, snaps location to ~10 km, and lists', async () => {
    const app = makeApp(ALL);
    expect((await post(app, { lat: 'x', lon: 1, brightness: 3 })).status).toBe(400);
    expect((await post(app, { lat: 64, lon: -21, brightness: 9 })).status).toBe(400);
    const r = await post(app, { lat: 64.1234, lon: -21.9876, brightness: 4, colors: ['green', 'evil'], direction: 'N' });
    expect(r.status).toBe(201);
    const s = (await r.json()).data;
    expect(s).toMatchObject({ lat: 64.1, lon: -22, colors: ['green'], direction: 'N' });
    const list = await (await app.request('/api/sightings')).json();
    expect(list.data).toHaveLength(1);
  });
  it('rate-limits per IP', async () => {
    const app = makeApp(ALL);
    const codes = [];
    for (let i = 0; i < 10; i++) codes.push((await post(app, { lat: 64, lon: -21, brightness: 2 }, '9.9.9.9')).status);
    expect(codes.filter((c) => c === 429).length).toBe(2);
  });
});

describe('push', () => {
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
  it('subscribe validates and test sends', async () => {
    const sendPush = vi.fn(async () => ({ gone: false }));
    const app = makeApp(ALL, { sendPush });
    expect((await (await app.request('/api/push/key')).json()).data.publicKey).toBe('PUB');
    const bad = await app.request('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: { endpoint: 'http://insecure' }, lat: 64, lon: -21 }) });
    expect(bad.status).toBe(400);
    const ok = await app.request('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub, lat: 64.15, lon: -21.94, label: 'Reykjavík', prefs: { minScore: 30, quietStart: 'bad' } }) });
    expect(ok.status).toBe(201);
    const stored = app.services.stores.subs.get()[0]!;
    expect(stored.prefs.minScore).toBe(30);
    expect(stored.prefs.quietStart).toBe('02:00');
    await app.request('/api/push/test', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
    expect(sendPush).toHaveBeenCalledTimes(1);
  });
  it('runAlerts evaluates rules per subscriber and drops gone subscriptions', async () => {
    const sendPush = vi.fn(async () => ({ gone: true }));
    const app = makeApp(ALL, { sendPush });
    const s: PushSub = { ...sub, lat: 64.15, lon: -21.95, label: 'Reykjavík', prefs: { minScore: 10, minKp: 1, bzSouth: true, quietStart: '04:00', quietEnd: '05:00', tz: 'UTC' }, createdAt: NOW.toISOString(), lastSent: {} };
    app.services.stores.subs.set([s]);
    const n = await app.services.runAlerts();
    // fixture: dark, overcast but Kp forecast ≥ 1 → at least the Kp rule fires
    expect(n).toBeGreaterThanOrEqual(1);
    expect(app.services.stores.subs.get()).toHaveLength(0);
  });
});
