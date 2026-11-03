import { postJson } from './api';

/**
 * Offline outbox: writes (sighting reports, "did you see it?" answers) are queued in
 * localStorage when there's no signal and replayed when the connection returns.
 */
interface Item {
  id: string;
  path: string;
  body: unknown;
  queuedAt: string;
  tries: number;
}
const KEY = 'nl-outbox';
const listeners = new Set<() => void>();

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Item[];
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-200)));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const outboxCount = () => read().length;
export function onOutboxChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** POST now if possible; otherwise queue. Resolves 'sent' | 'queued'. */
export async function postOrQueue(path: string, body: unknown): Promise<'sent' | 'queued'> {
  if (navigator.onLine) {
    try {
      await postJson(path, body);
      return 'sent';
    } catch (e) {
      // 4xx = bad request; don't queue forever
      if (/HTTP 4\d\d|required|invalid/i.test((e as Error).message)) throw e;
    }
  }
  write([...read(), { id: Math.random().toString(36).slice(2), path, body, queuedAt: new Date().toISOString(), tries: 0 }]);
  return 'queued';
}

let flushing = false;
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const items = read();
    const keep: Item[] = [];
    for (const it of items) {
      try {
        await postJson(it.path, it.body);
        sent++;
      } catch (e) {
        const msg = (e as Error).message;
        // drop permanently-invalid items and anything retried too often; keep the rest
        if (!/HTTP 4\d\d|required|invalid/i.test(msg) && it.tries < 20) keep.push({ ...it, tries: it.tries + 1 });
      }
    }
    write(keep);
  } finally {
    flushing = false;
  }
  return sent;
}

export function startOutbox() {
  const go = () => void flushOutbox();
  window.addEventListener('online', go);
  setTimeout(go, 3000);
  const id = setInterval(go, 60_000);
  return () => {
    window.removeEventListener('online', go);
    clearInterval(id);
  };
}
