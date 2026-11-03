import { getJson, postJson } from './api';
import { useSettings } from './store';

/** Web-push subscription lifecycle. iOS needs the app installed to the Home Screen (16.4+). */
export type PushSupport = 'ok' | 'unsupported' | 'needs-install' | 'denied';

export function pushSupport(): PushSupport {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function b64ToUint8(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission, subscribe, and register location + thresholds with the server. */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const { data } = await getJson<{ data: { publicKey: string } }>('/api/push/key');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(data.publicKey) }));
  await syncPush(sub);
}

/** Re-send location / thresholds (call when they change). */
export async function syncPush(sub?: PushSubscription | null) {
  const s = sub ?? (await currentSubscription());
  if (!s) return;
  const st = useSettings.getState();
  await postJson('/api/push/subscribe', {
    subscription: s.toJSON(),
    lat: st.location.lat,
    lon: st.location.lon,
    label: st.location.label,
    prefs: { ...st.alerts, minDark: st.minDarkness === 'astronomical' ? 'astro' : 'nautical', tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
}

export async function disablePush() {
  const s = await currentSubscription();
  if (!s) return;
  await postJson('/api/push/unsubscribe', { endpoint: s.endpoint }).catch(() => {});
  await s.unsubscribe();
}

export async function testPush() {
  const s = await currentSubscription();
  if (!s) throw new Error('Not subscribed');
  await postJson('/api/push/test', { endpoint: s.endpoint });
}
