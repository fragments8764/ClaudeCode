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
