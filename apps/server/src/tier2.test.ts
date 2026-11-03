import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';
import { UP2 } from './routes/extras';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../../../packages/core/src/__tests__/fixtures/${n}`, import.meta.url), 'utf8'));
let NOW = new Date('2026-11-02T21:30:00Z');

function makeApp(extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const routes: Record<string, unknown> = { [UP2.roadWeather]: fx('road-stations.json'), [UP2.roadCond]: fx('road-conditions.json'), [UP2.cap]: null };
  const fetch = async (input: RequestInfo | URL) => {
    const key = Object.keys(routes).find((k) => String(input).startsWith(k));
    if (!key) return new Response('down', { status: 503 });
    return routes[key] === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(routes[key]), { status: 200 });
  };
  const fetcher = new Fetcher(SOURCES, { fetch: fetch as typeof globalThis.fetch, retries: 0, sleep: async () => {} });
  return createApp({ fetcher, now: () => NOW, inlineConfig: { spots: [], cameras: [] }, ...extra });
}
const post = (app: ReturnType<typeof makeApp>, path: string, body: unknown) => app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '5.5.5.5' } });

describe('roads & route', () => {
  it('/api/roads classifies every station', async () => {
    const b = await (await makeApp().request('/api/roads')).json();
    expect(b.data.length).toBeGreaterThan(10);
    expect(b.data.every((s: { kind: string }) => ['clear', 'slippery', 'closed', 'wind', 'unknown'].includes(s.kind))).toBe(true);
  });
  it('/api/route returns a corridor between two points', async () => {
    const st = fx('road-stations.json') as { Breidd: number; Lengd: number }[];
    const a = st[0]!;
    const z = st[5]!;
    const b = await (await makeApp().request(`/api/route?fromLat=${a.Breidd}&fromLon=${a.Lengd}&toLat=${z.Breidd}&toLon=${z.Lengd}`)).json();
    expect(b.data.segments.length).toBeGreaterThan(0);
    expect((await makeApp().request('/api/route?fromLat=1')).status).toBe(400);
  });
  it('/api/warnings handles "no active warnings" (204)', async () => {
    expect((await (await makeApp().request('/api/warnings')).json()).data).toEqual([]);
  });
});

describe('trip plans', () => {
  const plan = { name: 'Ana', destination: { name: 'Þingvellir', lat: 64.2559, lon: -21.1299 }, returnBy: '2026-11-03T01:00:00Z', shareLocation: true };
  it('create → public view (no secret) → location (secret only) → check-in', async () => {
    const app = makeApp();
    const r = await post(app, '/api/plans', plan);
    expect(r.status).toBe(201);
    const { id, secret } = (await r.json()).data;
    expect(id).toMatch(/^[0-9a-f]{18}$/);
    const view = await (await app.request(`/api/plans/${id}`)).json();
    expect(view.data.status).toBe('out');
    expect(JSON.stringify(view)).not.toContain(secret);
    expect((await post(app, `/api/plans/${id}/location`, { secret: 'wrong', lat: 64.2, lon: -21.1 })).status).toBe(404);
    await post(app, `/api/plans/${id}/location`, { secret, lat: 64.21234567, lon: -21.1 });
    expect((await (await app.request(`/api/plans/${id}`)).json()).data.lastLocation).toMatchObject({ lat: 64.2123 });
    await post(app, `/api/plans/${id}/checkin`, { secret });
    expect((await (await app.request(`/api/plans/${id}`)).json()).data.status).toBe('safe');
  });
  it('location is never stored unless the owner opted in', async () => {
    const app = makeApp();
    const { id, secret } = (await (await post(app, '/api/plans', { ...plan, shareLocation: false })).json()).data;
    await post(app, `/api/plans/${id}/location`, { secret, lat: 64.2, lon: -21.1 });
    expect((await (await app.request(`/api/plans/${id}`)).json()).data.lastLocation).toBeNull();
  });
  it('validates input', async () => {
    const app = makeApp();
    expect((await post(app, '/api/plans', { ...plan, returnBy: '2027-01-01T00:00:00Z' })).status).toBe(400);
    expect((await post(app, '/api/plans', { ...plan, destination: { lat: 999 } })).status).toBe(400);
  });
  it('overdue → status overdue and one "are you back safe?" push to the owner', async () => {
    const sendPush = vi.fn(async () => ({ gone: false }));
    const app = makeApp({ sendPush, vapid: { publicKey: 'P', privateKey: 'K', subject: 'x' } });
    const endpoint = 'https://push.example/owner';
    await post(app, '/api/push/subscribe', { subscription: { endpoint, keys: { p256dh: 'a', auth: 'b' } }, lat: 64.15, lon: -21.95 });
    const { id } = (await (await post(app, '/api/plans', { ...plan, pushEndpoint: endpoint })).json()).data;
    NOW = new Date('2026-11-03T01:20:00Z');
    expect((await (await app.request(`/api/plans/${id}`)).json()).data.status).toBe('overdue');
    expect(await app.services.checkPlans()).toBe(1);
    expect(await app.services.checkPlans()).toBe(0); // only once
    expect(sendPush.mock.calls[0]![1]).toMatchObject({ title: 'Are you back safe?' });
    NOW = new Date('2026-11-02T21:30:00Z');
  });
});
