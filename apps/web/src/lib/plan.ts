import { getJson, postJson } from './api';
import { currentSubscription } from './push';

/** The user's own active trip plan (secret stays on this device). */
export interface ActivePlan {
  id: string;
  secret: string;
  destination: { name: string; lat: number; lon: number };
  returnBy: string;
  shareLocation: boolean;
}
export interface PublicPlan {
  id: string;
  name: string;
  destination: { name: string; lat: number; lon: number };
  returnBy: string;
  createdAt: string;
  shareLocation: boolean;
  lastLocation: { lat: number; lon: number; at: string } | null;
  checkedInAt: string | null;
  status: 'out' | 'overdue' | 'safe';
}

const KEY = 'nl-plan';
const listeners = new Set<() => void>();
export const onPlanChange = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
export function activePlan(): ActivePlan | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ActivePlan | null;
    // forget plans 12 h after their return time
    if (p && Date.now() > new Date(p.returnBy).getTime() + 12 * 3.6e6) return null;
    return p;
  } catch {
    return null;
  }
}
function save(p: ActivePlan | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const planUrl = (id: string) => `${location.origin}/#/plan/${id}`;

export async function createPlan(input: { name: string; destination: ActivePlan['destination']; returnBy: string; shareLocation: boolean }): Promise<ActivePlan> {
  const sub = await currentSubscription().catch(() => null);
  const r = await postJson<{ data: { id: string; secret: string } }>('/api/plans', { ...input, pushEndpoint: sub?.endpoint ?? null });
  const p: ActivePlan = { id: r.data.id, secret: r.data.secret, destination: input.destination, returnBy: input.returnBy, shareLocation: input.shareLocation };
  save(p);
  return p;
}

export async function checkIn(): Promise<void> {
  const p = activePlan();
  if (!p) return;
  await postJson(`/api/plans/${p.id}/checkin`, { secret: p.secret });
  save(null);
}

export async function cancelPlan(): Promise<void> {
  const p = activePlan();
  if (!p) return;
  await postJson(`/api/plans/${p.id}/delete`, { secret: p.secret }).catch(() => {});
  save(null);
}

export const fetchPlan = (id: string) => getJson<{ data: PublicPlan }>(`/api/plans/${id}`).then((r) => r.data);

/** While a plan with live location is active and the app is open, post position every 5 min. */
export function startLiveLocation(): () => void {
  let last = 0;
  let watch: number | null = null;
  const tick = (pos: GeolocationPosition) => {
    const p = activePlan();
    if (!p?.shareLocation || Date.now() - last < 5 * 60_000) return;
    last = Date.now();
    postJson(`/api/plans/${p.id}/location`, { secret: p.secret, lat: pos.coords.latitude, lon: pos.coords.longitude }).catch(() => {});
  };
  const sync = () => {
    const p = activePlan();
    if (p?.shareLocation && watch == null && 'geolocation' in navigator) watch = navigator.geolocation.watchPosition(tick, () => {}, { enableHighAccuracy: false, maximumAge: 60_000 });
    if (!p?.shareLocation && watch != null) {
      navigator.geolocation.clearWatch(watch);
      watch = null;
    }
  };
  sync();
  const off = onPlanChange(sync);
  return () => {
    off();
    if (watch != null) navigator.geolocation.clearWatch(watch);
  };
}
