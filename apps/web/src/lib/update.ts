/**
 * Auto-update.
 *
 * The service worker already activates a new version as soon as it is installed
 * (skipWaiting + clientsClaim). What was missing:
 *  - browsers only look for a new sw.js on navigation (or once a day), and a Home Screen
 *    app can stay open for days → we check every 30 min, when the app comes back to the
 *    foreground, and when the network returns;
 *  - the open page keeps running the old code until it reloads → we reload at a safe
 *    moment: while the app is in the background, when you come back to it, or when you've
 *    been idle for 20 s with nothing open (never mid-tap, mid-form or in driving mode);
 *  - after a deploy, old lazy chunks no longer exist → a failed chunk load reloads once.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

const CHECK_EVERY_MS = 30 * 60_000;
const MIN_CHECK_GAP_MS = 60_000;
const IDLE_MS = 20_000;
const FROM_KEY = 'nl-update-from';
const CHUNK_KEY = 'nl-chunk-reload';

export type UpdateStatus = 'unsupported' | 'idle' | 'checking' | 'current' | 'ready' | 'offline';

let reg: ServiceWorkerRegistration | null = null;
let status: UpdateStatus = 'unsupported';
let lastCheck = 0;
let lastInput = Date.now();
let pending = false;
let force = false;
let guard: () => boolean = () => true;
const listeners = new Set<(s: UpdateStatus) => void>();

function set(s: UpdateStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}
export const getUpdateStatus = () => status;
export function onUpdateStatus(l: (s: UpdateStatus) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
/** App says whether reloading now would interrupt the user (sheet open, typing, driving…). */
export function setUpdateGuard(g: () => boolean) {
  guard = g;
}

const store = {
  get: (k: string, s: Storage = localStorage) => {
    try { return s.getItem(k); } catch { return null; }
  },
  set: (k: string, v: string, s: Storage = localStorage) => {
    try { s.setItem(k, v); } catch { /* private mode */ }
  },
  del: (k: string) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

function reload() {
  store.set(FROM_KEY, BUILD_ID);
  location.reload();
}

/** Pure decision, exported for tests. */
export function shouldApply(o: { pending: boolean; hidden: boolean; force: boolean; safe: boolean; idleMs: number }) {
  if (!o.pending) return false;
  return o.hidden || o.force || (o.safe && o.idleMs >= IDLE_MS);
}

function tryApply() {
  let safe = false;
  try { safe = guard(); } catch { /* keep waiting */ }
  if (shouldApply({ pending, hidden: document.visibilityState === 'hidden', force, safe, idleMs: Date.now() - lastInput })) reload();
}

/** Ask the server for a newer sw.js. `manual` = the user tapped "Check for updates" (apply right away). */
export async function checkForUpdate(manual = false): Promise<UpdateStatus> {
  if (!reg) return status;
  if (pending) {
    if (manual) reload();
    return 'ready';
  }
  if (!manual && Date.now() - lastCheck < MIN_CHECK_GAP_MS) return status;
  if (!navigator.onLine) {
    if (manual) set('offline');
    return 'offline';
  }
  lastCheck = Date.now();
  if (manual) set('checking');
  try {
    await reg.update();
  } catch {
    if (manual) set('offline');
    return 'offline';
  }
  if (reg.installing || reg.waiting) {
    force = force || manual;
    set('ready');
    return 'ready';
  }
  if (manual || status === 'checking') set('current');
  return 'current';
}

/** Version we just updated to (once), so the app can say "Updated to v…". */
export function consumeUpdateNotice(): string | null {
  const from = store.get(FROM_KEY);
  if (!from) return null;
  store.del(FROM_KEY);
  return from !== BUILD_ID ? APP_VERSION : null;
}

/** A lazy chunk from the previous deploy is gone → reload once (not in a loop). */
export function installChunkRecovery() {
  window.addEventListener('vite:preloadError', (e) => {
    const last = Number(store.get(CHUNK_KEY, sessionStorage) || 0);
    if (Date.now() - last < 60_000) return;
    store.set(CHUNK_KEY, String(Date.now()), sessionStorage);
    e.preventDefault();
    reload();
  });
}

export async function startAutoUpdate() {
  installChunkRecovery();
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller;
  try {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return;
  }
  set('idle');

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install claiming the page, not an update
    pending = true;
    set('ready');
    tryApply();
  });

  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const)
    addEventListener(ev, () => (lastInput = Date.now()), { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastInput = 0; // just came back: reloading now interrupts nothing
      tryApply();
      void checkForUpdate();
    } else tryApply();
  });
  addEventListener('online', () => void checkForUpdate());
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
  setInterval(() => pending && tryApply(), 5_000);
}
