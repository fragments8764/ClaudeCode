import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { Fetcher } from './lib/fetcher';
import { SOURCES } from './lib/sources';

const PORT = Number(process.env.PORT ?? 8787);
const CONTACT = process.env.CONTACT_EMAIL ?? '';
// MET Norway's ToS requires an identifying User-Agent with contact info.
const userAgent = `nordurljos/0.1 (+https://github.com/fragments8764/ClaudeCode${CONTACT ? `; ${CONTACT}` : ''})`;
// NB: MET Norway rejects placeholder addresses (e.g. @example.com) with HTTP 403 — use a real one or none.
if (!CONTACT) console.warn('[nordurljos] CONTACT_EMAIL not set — set a real contact address for MET Norway (their ToS).');

const fetcher = new Fetcher(SOURCES, { userAgent });
const app = createApp({ fetcher, corsOrigin: process.env.CORS_ORIGIN ?? '*' });

// In production, serve the built PWA from the same origin (single deploy).
const webDist = resolve(process.env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname);
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

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[nordurljos] API listening on http://localhost:${info.port}`);
});
