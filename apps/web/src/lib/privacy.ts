import { idbClear, idbGet, idbKeys } from './idb';
import { cancelPlan } from './plan';
import { disablePush } from './push';
import { deleteAllMySightings, mySightings } from './mySightings';

/** Everything this app stores on the device, as one JSON file. */
export async function exportMyData(): Promise<File> {
  const local: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (!k.startsWith('nordurljos') && !k.startsWith('nl-')) continue;
    try {
      local[k] = JSON.parse(localStorage.getItem(k)!);
    } catch {
      local[k] = localStorage.getItem(k);
    }
  }
  // tokens are secrets for deleting your own reports — keep them out of the export
  if (local['nl-plan']) local['nl-plan'] = { ...(local['nl-plan'] as object), secret: '(hidden)' };
  local['nl-my-sightings'] = mySightings().map((m) => ({ id: m.id, at: m.at, photo: m.photo }));
  const photos: Record<string, unknown> = {};
  for (const k of await idbKeys().catch(() => [])) photos[k] = await idbGet(k).catch(() => null);
  const data = { exportedAt: new Date().toISOString(), app: 'Norðurljós', note: 'All data stored on this device. Server-side we keep no account; anonymous community reports can be deleted from Settings → Privacy.', local, photos };
  return new File([JSON.stringify(data, null, 2)], `nordurljos-my-data-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
}

/** Delete everything: server-side items we can identify (push, reports, plan) and all local data. */
export async function deleteMyData(): Promise<{ reports: number }> {
  await disablePush().catch(() => {});
  await cancelPlan().catch(() => {});
  const reports = await deleteAllMySightings().catch(() => 0);
  await idbClear().catch(() => {});
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
    keys.filter((k) => k.startsWith('nordurljos') || k.startsWith('nl-')).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  return { reports };
}
