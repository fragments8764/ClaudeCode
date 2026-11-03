import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';

const NOW = new Date('2026-11-02T22:00:00Z');
const app = () => {
  const fetcher = new Fetcher(SOURCES, { fetch: (async () => new Response('down', { status: 503 })) as typeof globalThis.fetch, retries: 0, sleep: async () => {} });
  return createApp({ fetcher, now: () => NOW, inlineConfig: { spots: [], cameras: [] }, adminToken: 'adm' });
};
let ip = 1;
const post = (a: ReturnType<typeof app>, path: string, body: unknown, from = `10.0.0.${ip++}`) =>
  a.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': from } });
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64')}`;

describe('community sightings', () => {
  it('returns an owner token once, never in public listings; verification appears with corroboration', async () => {
    const a = app();
    const r1 = (await (await post(a, '/api/sightings', { lat: 64.1, lon: -21.9, brightness: 3 })).json()).data;
    expect(r1.token).toMatch(/^[0-9a-f]{32}$/);
    expect(r1.verification.confidence).toBe('unverified');
    await post(a, '/api/sightings', { lat: 64.2, lon: -21.7, brightness: 4 });
    const list = (await (await a.request('/api/sightings?minutes=60')).json()).data;
    expect(list).toHaveLength(2);
    expect(JSON.stringify(list)).not.toContain(r1.token);
    expect(JSON.stringify(list)).not.toContain('ownerHash');
    expect(list[0].verification.nearbyReports).toBe(1);
    expect(list[0].verification.confidence).toBe('low');
  });
  it('private spots are fuzzed to ~25 km', async () => {
    const r = (await (await post(a2(), '/api/sightings', { lat: 64.1234, lon: -21.9876, brightness: 2, private: true })).json()).data;
    expect(r).toMatchObject({ lat: 64, lon: -22, private: true });
  });
  it('photos: owner only, JPEG only; served; deletable on request', async () => {
    const a = app();
    const { id, token } = (await (await post(a, '/api/sightings', { lat: 64.1, lon: -21.9, brightness: 5, feed: { consent: true, credit: 'Ana' } })).json()).data;
    expect((await post(a, `/api/sightings/${id}/photo`, { token: 'nope', dataUrl: JPEG })).status).toBe(404);
    expect((await post(a, `/api/sightings/${id}/photo`, { token, dataUrl: 'data:image/png;base64,iVBORw0KGgo=' })).status).toBe(400);
    expect((await post(a, `/api/sightings/${id}/photo`, { token, dataUrl: JPEG })).status).toBe(200);
    const img = await a.request(`/api/photos/${id}`);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    const feed = (await (await a.request('/api/feed')).json()).data;
    expect(feed).toHaveLength(1);
    expect(feed[0].feed.credit).toBe('Ana');
    await post(a, `/api/sightings/${id}/delete`, { token, photoOnly: true });
    expect((await a.request(`/api/photos/${id}`)).status).toBe(404);
    expect((await (await a.request('/api/feed')).json()).data).toHaveLength(0);
  });
  it('feed needs explicit consent', async () => {
    const a = app();
    const { id, token } = (await (await post(a, '/api/sightings', { lat: 64.1, lon: -21.9, brightness: 5 })).json()).data;
    await post(a, `/api/sightings/${id}/photo`, { token, dataUrl: JPEG });
    expect((await (await a.request('/api/feed')).json()).data).toHaveLength(0);
  });
  it('3 different reporters hide a report; admin can review, unhide or delete', async () => {
    const a = app();
    const { id } = (await (await post(a, '/api/sightings', { lat: 64.1, lon: -21.9, brightness: 3 })).json()).data;
    for (const who of ['1.1.1.1', '2.2.2.2', '2.2.2.2', '3.3.3.3']) await post(a, `/api/sightings/${id}/report`, {}, who);
    expect((await (await a.request('/api/sightings')).json()).data).toHaveLength(0);
    expect((await a.request('/api/admin/sightings')).status).toBe(404);
    const mod = (await (await a.request('/api/admin/sightings?token=adm')).json()).data;
    expect(mod[0]).toMatchObject({ id, reports: 3, hidden: true });
    await a.request(`/api/admin/sightings/${id}/unhide?token=adm`, { method: 'POST' });
    expect((await (await a.request('/api/sightings')).json()).data).toHaveLength(1);
    await a.request(`/api/admin/sightings/${id}/delete?token=adm`, { method: 'POST' });
    expect((await (await a.request('/api/sightings')).json()).data).toHaveLength(0);
  });
  it('owners can delete their report', async () => {
    const a = app();
    const { id, token } = (await (await post(a, '/api/sightings', { lat: 64.1, lon: -21.9, brightness: 3 })).json()).data;
    expect((await post(a, `/api/sightings/${id}/delete`, { token: 'x' })).status).toBe(404);
    await post(a, `/api/sightings/${id}/delete`, { token });
    expect((await (await a.request('/api/sightings')).json()).data).toHaveLength(0);
  });
});
function a2() {
  return app();
}
