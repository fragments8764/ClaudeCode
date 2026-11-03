import { useSettings } from './store';

/**
 * Opt-in, privacy-friendly analytics & crash reporting.
 *  - analytics: only event names (e.g. "tab.map"), batched; no IDs, no location, no IP stored server-side
 *  - crashes: message + trimmed stack + app version + browser family
 * Both are OFF by default and controlled in Settings → Privacy.
 */
const VERSION = '1.1.0';
const API = import.meta.env.VITE_API_BASE ?? '';
let queue: string[] = [];

export function track(event: string) {
  if (!useSettings.getState().analytics) return;
  queue.push(event);
  if (queue.length >= 20) flush();
}

function flush() {
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 50) });
  try {
    if (navigator.sendBeacon?.(`${API}/api/telemetry`, new Blob([body], { type: 'application/json' }))) return;
  } catch {
    /* fall through */
  }
  fetch(`${API}/api/telemetry`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
}

const browser = () => {
  const ua = navigator.userAgent;
  return /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
};

export function reportCrash(err: unknown) {
  if (!useSettings.getState().crashReports) return;
  const e = err instanceof Error ? err : new Error(String(err));
  const body = JSON.stringify({ message: e.message, stack: e.stack ?? '', version: VERSION, browser: browser() });
  fetch(`${API}/api/crash`, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => {});
}

export function startTelemetry() {
  const onErr = (e: ErrorEvent) => reportCrash(e.error ?? e.message);
  const onRej = (e: PromiseRejectionEvent) => reportCrash(e.reason);
  const onHide = () => document.visibilityState === 'hidden' && flush();
  window.addEventListener('error', onErr);
  window.addEventListener('unhandledrejection', onRej);
  document.addEventListener('visibilitychange', onHide);
  const id = setInterval(flush, 60_000);
  return () => {
    window.removeEventListener('error', onErr);
    window.removeEventListener('unhandledrejection', onRej);
    document.removeEventListener('visibilitychange', onHide);
    clearInterval(id);
  };
}
