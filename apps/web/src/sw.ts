/// <reference lib="webworker" />
/**
 * Norðurljós service worker
 *  - precache the app shell (works offline after first visit)
 *  - /api/*: network-first with a 6 s timeout → last good response when signal drops
 *  - map tiles, glyphs, sprites, styles: cache-first (30 days) so viewed areas and the
 *    "Save Iceland map" download work offline
 *  - web push: show alerts; tap opens the app on the right screen
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

registerRoute(
  ({ url, request }) => url.origin === self.location.origin && url.pathname.startsWith('/api/') && request.method === 'GET' && !url.pathname.startsWith('/api/health') && !url.pathname.startsWith('/api/push'),
  new NetworkFirst({
    cacheName: 'api',
    networkTimeoutSeconds: 6,
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 24 * 3600 }), new CacheableResponsePlugin({ statuses: [200] })],
  }),
);

export const TILE_CACHE = 'map-tiles';
registerRoute(
  ({ url }) => url.hostname === 'tiles.openfreemap.org' || url.hostname === 'gibs.earthdata.nasa.gov',
  new CacheFirst({
    cacheName: TILE_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 4000, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true }), new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
);

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let p: PushPayload = { title: 'Norðurljós', body: 'The sky looks interesting.' };
  try {
    p = { ...p, ...(event.data?.json() as PushPayload) };
  } catch {
    if (event.data) p.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag ?? 'aurora',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: p.url ?? '/#/tonight' },
      // @ts-expect-error vibrate is supported on Android
      vibrate: [20, 80, 20],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await (c as WindowClient).navigate(url).catch(() => {});
          return (c as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
