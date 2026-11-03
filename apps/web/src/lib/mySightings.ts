import { postJson } from './api';

/** Owner tokens for your own community reports (device only) — used to delete reports/photos. */
const KEY = 'nl-my-sightings';
export interface Mine {
  id: string;
  token: string;
  at: string;
  photo: boolean;
}
export function mySightings(): Mine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Mine[];
  } catch {
    return [];
  }
}
function save(list: Mine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-100)));
  } catch {
    /* ignore */
  }
}
export const rememberSighting = (m: Mine) => save([...mySightings().filter((x) => x.id !== m.id), m]);
export async function deleteMySighting(id: string, photoOnly = false) {
  const m = mySightings().find((x) => x.id === id);
  if (!m) return;
  await postJson(`/api/sightings/${id}/delete`, { token: m.token, photoOnly });
  save(photoOnly ? mySightings().map((x) => (x.id === id ? { ...x, photo: false } : x)) : mySightings().filter((x) => x.id !== id));
}
export async function deleteAllMySightings(): Promise<number> {
  let n = 0;
  for (const m of mySightings()) {
    await postJson(`/api/sightings/${m.id}/delete`, { token: m.token }).then(() => n++).catch(() => {});
  }
  save([]);
  return n;
}
export const reportSighting = (id: string) => postJson(`/api/sightings/${id}/report`, {});
