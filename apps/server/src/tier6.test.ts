import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp, UPSTREAM } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';
import type { PushSub } from './routes/extras';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../../../packages/core/src/__tests__/fixtures/${n}`, import.meta.url), 'utf8'));
const NOW = new Date('2026-11-02T22:00:00Z');
const routes: Record<string, unknown> = {
  [UPSTREAM.kp]: fx('noaa-kp.json'),
  [UPSTREAM.kpForecast]: fx('noaa-kp-forecast.json'),
  [UPSTREAM.rtswWind]: fx('rtsw-wind.json'),
  [UPSTREAM.rtswMag]: fx('rtsw-mag.json'),
  [UPSTREAM.ovation]: fx('ovation.json'),
  'https://api.met.no/': fx('metno-complete.json'),
  'https://api.open-meteo.com/': fx('open-meteo.json'),
};
function app(features?: Record<string, { tier: 'free' | 'pro'; enabled: boolean }>, sendPush?: (...a: unknown[]) => Promise<{ gone: boolean }>) {
  const fetch = async (input: RequestInfo | URL) => {
    const key = Object.keys(routes).find((k) => String(input).startsWith(k));
    return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response('down', { status: 503 });
  };
  const fetcher = new Fetcher(SOURCES, { fetch: fetch as typeof globalThis.fetch, retries: 0, sleep: async () => {} });
  return createApp({ fetcher, now: () => NOW, inlineConfig: { spots: [], cameras: [{ id: 'c', name: 'Cam', region: '', country: 'IS', lat: 64, lon: -21, kind: 'town', embed: 'link', pageUrl: 'https://x', attribution: 'Owner' }], features }, adminToken: 'adm', sendPush: sendPush as never, vapid: sendPush ? { publicKey: 'P', privateKey: 'K', subject: 'x' } : null });
}
const post = (a: ReturnType<typeof app>, path: string, body: unknown) => a.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '7.7.7.7' } });

describe('sources & credits', () => {
  it('lists every provider with licence/terms, plus camera owners', async () => {
    const d = (await (await app().request('/api/sources')).json()).data;
    const names = d.providers.map((p: { provider: string }) => p.provider);
    expect(names).toEqual(expect.arrayContaining(['NOAA SWPC', 'Open-Meteo', 'MET Norway', 'Icelandic Met Office', 'Vegagerðin (road.is)', 'INTERMAGNET', 'OpenFreeMap', 'NASA GIBS']));
    expect(d.providers.find((p: { provider: string }) => p.provider === 'Open-Meteo').flag).toMatch(/paid key/);
    expect(d.providers.every((p: { license?: string }) => typeof p.license === 'string')).toBe(true);
    expect(d.cameras[0]).toMatchObject({ id: 'c', attribution: 'Owner' });
  });
});

describe('telemetry & crashes (opt-in, anonymous)', () => {
  it('stores only whitelisted event names as daily counts', async () => {
    const a = app();
    await post(a, '/api/telemetry', { events: ['tab.map', 'tab.map', 'tool.gaps', 'bad event!', { x: 1 }], userId: 'should-be-ignored' });
    const t = a.services.stores.telemetry.get();
    expect(t['2026-11-02']).toEqual({ 'tab.map': 2, 'tool.gaps': 1 });
    expect(JSON.stringify(t)).not.toContain('should-be-ignored');
  });
  it('crash reports drop URL query strings and are hour-rounded', async () => {
    const a = app();
    await post(a, '/api/crash', { message: 'Boom at https://x.is/a?lat=64.123&token=abc', stack: 'at f (https://x.is/app.js?v=1:1:2)', version: '1.1.0', browser: 'Chrome' });
    const c = a.services.stores.crashes.get()[0]!;
    expect(c.message).not.toContain('lat=');
    expect(c.stack).not.toContain('v=1');
    expect(c.at).toBe('2026-11-02T22:00Z');
    expect((await a.request('/api/admin/telemetry')).status).toBe(404);
    expect((await a.request('/api/admin/telemetry?token=adm')).status).toBe(200);
  });
});

describe('feature flags', () => {
  it('exposes flags and gates advanced alerts', async () => {
    const send = vi.fn(async (..._a: unknown[]) => ({ gone: false }));
    const a = app({ 'alerts.advanced': { tier: 'pro', enabled: false }, 'alerts.basic': { tier: 'free', enabled: true } }, send);
    expect((await (await a.request('/api/features')).json()).data['alerts.advanced'].enabled).toBe(false);
    const sub: PushSub = { endpoint: 'https://p/x', keys: { p256dh: 'a', auth: 'b' }, lat: 64.15, lon: -21.95, label: 'R', prefs: { minScore: 0, minKp: 1, bzSouth: true, quietStart: '04:00', quietEnd: '05:00', tz: 'UTC' }, createdAt: NOW.toISOString(), lastSent: {} };
    a.services.stores.subs.set([sub]);
    await a.services.runAlerts();
    const rules = send.mock.calls.map((c) => (c[1] as { tag: string }).tag);
    expect(rules.every((t) => t === 'score' || t === 'kp')).toBe(true);
  });
});

import { parseTimezone } from './routes/extras';
describe('timezone lookup', () => {
  it('reads the IANA zone from Open-Meteo timezone=auto', () => {
    expect(parseTimezone({ timezone: 'Atlantic/Reykjavik', utc_offset_seconds: 0 })).toEqual({ timezone: 'Atlantic/Reykjavik', utcOffsetSec: 0 });
    expect(parseTimezone({ timezone: 'America/Argentina/Buenos_Aires', utc_offset_seconds: -10800 }).timezone).toBe('America/Argentina/Buenos_Aires');
  });
  it('rejects junk', () => {
    expect(parseTimezone({ timezone: '<script>' }).timezone).toBeNull();
    expect(parseTimezone(null)).toEqual({ timezone: null, utcOffsetSec: null });
  });
});

import { parseOembed } from './routes/extras';
describe('live video cameras', () => {
  it('treats a YouTube oEmbed with an iframe as embeddable', () => {
    expect(parseOembed({ title: 'Northern Lights powered by EXPLORE.org', html: '<iframe width="200" src="https://www.youtube.com/embed/a0i1Kg6fROg"></iframe>' })).toEqual({ embeddable: true, title: 'Northern Lights powered by EXPLORE.org' });
    expect(parseOembed({}).embeddable).toBe(false);
  });
  it('falls back to a link when the stream cannot be embedded', async () => {
    const cam = { id: 'v1', name: 'Vid', region: 'X', country: 'CA', lat: 58.7, lon: -93.8, kind: 'allsky', embed: 'video' as const, video: { provider: 'youtube' as const, id: 'gone_______' }, pageUrl: 'https://example.org', attribution: 'x' };
    const fetchImpl = vi.fn(async (url: string) => (url.includes('oembed') ? new Response('Not Found', { status: 404 }) : new Response(JSON.stringify([{ current: { cloud_cover: 10 } }]), { headers: { 'content-type': 'application/json' } })));
    const app = createApp({ fetcher: new Fetcher(SOURCES, { fetch: fetchImpl as unknown as typeof globalThis.fetch, retries: 0, sleep: async () => {} }), inlineConfig: { cameras: [cam] } } as never);
    const r = await (await app.request('/api/cameras')).json();
    expect(r.data[0].embed).toBe('link');
    expect(r.data[0].status).toBe('link');
    expect(r.data[0].video).toBeUndefined();
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes('oembed'))).toBe(true); // it really asked YouTube
  });
  it('keeps an embeddable stream as in-app video with a proxied poster', async () => {
    const cam = { id: 'v2', name: 'Vid', region: 'X', country: 'CA', lat: 58.7, lon: -93.8, kind: 'allsky', embed: 'video' as const, video: { provider: 'youtube' as const, id: 'a0i1Kg6fROg' }, pageUrl: 'https://example.org', attribution: 'x' };
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('oembed')
        ? new Response(JSON.stringify({ title: 't', html: '<iframe src="x"></iframe>' }), { headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify([{ current: { cloud_cover: 10 } }]), { headers: { 'content-type': 'application/json' } }),
    );
    const app = createApp({ fetcher: new Fetcher(SOURCES, { fetch: fetchImpl as unknown as typeof globalThis.fetch, retries: 0, sleep: async () => {} }), inlineConfig: { cameras: [cam] } } as never);
    const r = await (await app.request('/api/cameras')).json();
    expect(r.data[0]).toMatchObject({ embed: 'video', status: 'live', video: { id: 'a0i1Kg6fROg' }, poster: '/api/cameras/v2/image' });
  });
});

describe('beta feedback', () => {
  // smallest valid JPEG header + filler is enough for our checks
  const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]).toString('base64')}`;
  it('stores message, screen, version and device — and an optional screenshot', async () => {
    const a = app();
    const r = await post(a, '/api/beta-feedback', { message: 'Map froze while dragging', screen: '#/map', version: '1.3.0', device: 'iOS Safari app 390x844', screenshot: jpeg, lat: 64.1, ip: 'x' });
    expect(r.status).toBe(200);
    const list = (await (await a.request('/api/admin/beta-feedback?token=adm')).json()).data;
    expect(list[0]).toMatchObject({ message: 'Map froze while dragging', screen: '#/map', version: '1.3.0', shot: true });
    expect(JSON.stringify(list[0])).not.toMatch(/64\.1|7\.7\.7\.7/); // no location, no IP
    const img = await a.request(`/api/admin/beta-feedback/${list[0].id}/screenshot?token=adm`);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
  });
  it('rejects empty messages and non-JPEG screenshots; admin-only reading', async () => {
    const a = app();
    expect((await post(a, '/api/beta-feedback', { message: ' ' })).status).toBe(400);
    expect((await post(a, '/api/beta-feedback', { message: 'hello', screenshot: 'data:image/png;base64,AAAA' })).status).toBe(400);
    expect((await a.request('/api/admin/beta-feedback')).status).toBe(404);
  });
});

describe('health exposes settings problems by name only', () => {
  it('never leaks values', async () => {
    const a = createApp({ fetcher: new Fetcher(SOURCES, { fetch: (async () => new Response('{}')) as never, retries: 0, sleep: async () => {} }), inlineConfig: { spots: [], cameras: [] }, configIssues: [{ key: 'ADMIN_TOKEN', level: 'warn', problem: 'secret-ish detail', fix: 'x' }] } as never);
    const h = await (await a.request('/api/health')).json();
    expect(h.config).toEqual({ ok: true, issues: [{ key: 'ADMIN_TOKEN', level: 'warn' }] });
    expect(JSON.stringify(h)).not.toMatch(/secret-ish/);
  });
});
