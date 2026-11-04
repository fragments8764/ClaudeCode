import { useSyncExternalStore } from 'react';

/**
 * Is the server actually reachable? navigator.onLine only says "some network exists": with
 * one bar of signal, or Wi-Fi without internet, it stays true while every request times out.
 * We combine it with real outcomes: our own fetches, and the service worker telling us when
 * its network attempt failed (it then answers from cache, so the page can't tell otherwise).
 */
let reachable = true;
const subs = new Set<() => void>();
export function reportNetwork(ok: boolean) {
  if (ok === reachable) return;
  reachable = ok;
  subs.forEach((f) => f());
}
export const isReachable = () => reachable;

let wired = false;
function wire() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  addEventListener('online', () => subs.forEach((f) => f()));
  addEventListener('offline', () => subs.forEach((f) => f()));
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; ok?: boolean } | null;
    if (d?.type === 'net') reportNetwork(!!d.ok);
  });
}

/** true when the phone says it's online AND the last real request got through. */
export function useOnline(): boolean {
  wire();
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => navigator.onLine && reachable,
    () => true,
  );
}
