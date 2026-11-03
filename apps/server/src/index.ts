import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import webpush from 'web-push';
import { createApp } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';
import type { SendPush } from './routes/extras';

const PORT = Number(process.env.PORT ?? 8787);
const CONTACT = process.env.CONTACT_EMAIL ?? '';
const here = (p: string) => new URL(p, import.meta.url).pathname;
const CONFIG_DIR = resolve(process.env.CONFIG_DIR ?? here('../../../config'));
const DATA_DIR = resolve(process.env.DATA_DIR ?? here('../../../data'));

// MET Norway's ToS requires an identifying User-Agent; a contact address is optional here.
// NB: MET Norway rejects placeholder addresses (e.g. @example.com) with HTTP 403 — use a real one or none.
const userAgent = `nordurljos/1.0 (+https://github.com/fragments8764/ClaudeCode${CONTACT ? `; ${CONTACT}` : ''})`;
if (!CONTACT) console.warn('[nordurljos] CONTACT_EMAIL not set — consider setting a real contact address for MET Norway (their ToS).');

/** VAPID keys: env vars win; otherwise generate once and persist in DATA_DIR. */
function loadVapid() {
  const subject = process.env.VAPID_SUBJECT ?? (CONTACT ? `mailto:${CONTACT}` : 'https://github.com/fragments8764/ClaudeCode');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject };
  }
  const file = join(DATA_DIR, 'vapid.json');
  try {
    return { ...(JSON.parse(readFileSync(file, 'utf8')) as { publicKey: string; privateKey: string }), subject };
  } catch {
    const k = webpush.generateVAPIDKeys();
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(k), { mode: 0o600 });
    console.log(`[push] generated VAPID keys → ${file} (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in production)`);
    return { ...k, subject };
  }
}

const vapid = loadVapid();
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

const sendPush: SendPush = async (sub, payload) => {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 30 * 60, urgency: 'high', topic: payload.tag.slice(0, 32) });
    return { gone: false };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { gone: true };
    throw e;
  }
};

const fetcher = new Fetcher(SOURCES, { userAgent });
const app = createApp({ fetcher, corsOrigin: process.env.CORS_ORIGIN ?? '*', configDir: CONFIG_DIR, dataDir: DATA_DIR, vapid, sendPush, adminToken: process.env.ADMIN_TOKEN || null });
if (!process.env.ADMIN_TOKEN) console.log('[nordurljos] ADMIN_TOKEN not set: /admin validation dashboard disabled.');

// In production, serve the built PWA from the same origin (single deploy).
const webDist = resolve(process.env.WEB_DIST ?? here('../../web/dist'));
if (existsSync(webDist)) {
  const isApi = (path: string) => path === '/api' || path.startsWith('/api/');
  app.use('/*', async (c, next) => {
    if (isApi(c.req.path)) return next();
    const p = c.req.path;
    // Hashed build assets never change; the service worker and HTML must always revalidate.
    if (p.startsWith('/assets/')) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    else if (p === '/sw.js' || p.startsWith('/workbox-') || p === '/' || p.endsWith('.html') || p.endsWith('.webmanifest')) c.header('Cache-Control', 'no-cache');
    return serveStatic({ root: webDist })(c, next);
  });
  // SPA fallback for client-side routes (never for /api).
  app.get('*', async (c, next) => (isApi(c.req.path) ? next() : serveStatic({ path: resolve(webDist, 'index.html') })(c, next)));
  console.log(`[nordurljos] serving web app from ${webDist}`);
}

// Background jobs: alert poller (5 min) + camera timelapse capture (5 min).
const ALERT_MS = Number(process.env.ALERT_INTERVAL_MS ?? 5 * 60_000);
const tick = async () => {
  try {
    const n = await app.services.runAlerts();
    if (n) console.log(`[push] sent ${n} alert(s)`);
  } catch (e) {
    console.warn('[push] poller error', (e as Error).message);
  }
  app.services.captureFrames().catch(() => {});
};
setInterval(tick, ALERT_MS).unref();
setTimeout(tick, 15_000).unref();

const shutdown = () => {
  app.services.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[nordurljos] API listening on http://localhost:${info.port} (config: ${CONFIG_DIR}, data: ${DATA_DIR})`);
});
