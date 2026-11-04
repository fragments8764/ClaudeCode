import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { snapCoord } from '@nordurljos/core';
import { useSettings } from './store';
import { resolveWeights, type Corridor, type RoadRoute, type NightOutlook, type ValueGrid, type Spot, type Weights } from '@nordurljos/core';
import type { AuroraAt, Camera, ClearNow, Clouds, Envelope, Health, NowcastData, OvationGridData, SafetyData, SightingData, SpaceWeather } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function getJson<T>(path: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Last-known-good persistence: in the field, signal drops. We seed queries with the
 * last successful response from localStorage so the screen is never empty, and the
 * UI shows its age. (The service worker adds a second layer of offline caching.)
 */
function loadLast<T>(key: string): { data: T; at: number } | undefined {
  try {
    const raw = localStorage.getItem(`nl-last:${key}`);
    return raw ? (JSON.parse(raw) as { data: T; at: number }) : undefined;
  } catch {
    return undefined;
  }
}
function saveLast(key: string, data: unknown) {
  try {
    localStorage.setItem(`nl-last:${key}`, JSON.stringify({ data, at: Date.now() }));
  } catch {
    /* quota / private mode — ignore */
  }
}

function usePersistedQuery<T>(key: string, path: string, refetchMs: number, enabled = true) {
  const last = loadLast<T>(key);
  // Battery saver: refresh 3× less often (alerts still arrive via push).
  const saver = useSettings((s) => s.batterySaver);
  const q = useQuery({
    queryKey: [key],
    queryFn: () => getJson<T>(path),
    enabled,
    refetchInterval: saver ? refetchMs * 3 : refetchMs,
    refetchOnWindowFocus: true,
    staleTime: refetchMs / 2,
    retry: 2,
    initialData: last?.data,
    initialDataUpdatedAt: last?.at,
  });
  useEffect(() => {
    if (q.data && q.isSuccess && q.dataUpdatedAt !== last?.at) saveLast(key, q.data);
  }, [q.dataUpdatedAt]);
  return q;
}

export function useSpaceWeather() {
  return usePersistedQuery<Envelope<SpaceWeather>>('space-weather', '/api/space-weather', 60_000);
}

export function useClouds(lat: number, lon: number) {
  const sLat = snapCoord(lat);
  const sLon = snapCoord(lon);
  return usePersistedQuery<Envelope<Clouds>>(`clouds:${sLat},${sLon}`, `/api/clouds?lat=${sLat}&lon=${sLon}`, 5 * 60_000);
}

export function useAurora(lat: number, lon: number) {
  const sLat = snapCoord(lat);
  const sLon = snapCoord(lon);
  return usePersistedQuery<Envelope<AuroraAt>>(`aurora:${sLat},${sLon}`, `/api/aurora?lat=${sLat}&lon=${sLon}`, 5 * 60_000);
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => getJson<Health>('/api/health'), refetchInterval: 15_000 });
}

const snap = (v: number) => snapCoord(v);

export const useCloudGrid = () => usePersistedQuery<Envelope<ValueGrid>>('grid-clouds', '/api/grid/clouds', 30 * 60_000);
export const useOvationGrid = () => usePersistedQuery<Envelope<OvationGridData>>('grid-ovation', '/api/grid/ovation', 5 * 60_000);
export const useSpots = () => usePersistedQuery<{ data: Spot[] }>('spots', '/api/spots', 6 * 3600_000);
export const useCameras = () => usePersistedQuery<Envelope<Camera[]>>('cameras', '/api/cameras', 3 * 60_000);
export const useNowcast = () => usePersistedQuery<Envelope<NowcastData>>('nowcast', '/api/nowcast', 2 * 60_000);
export const useSightings = () => usePersistedQuery<{ data: SightingData[] }>('sightings', '/api/sightings?hours=6', 60_000);
export const useLiveSightings = () => usePersistedQuery<{ data: SightingData[] }>('sightings-live', '/api/sightings?minutes=60', 60_000);
export const useFeed = (enabled: boolean) => usePersistedQuery<{ data: SightingData[] }>('feed', '/api/feed', 10 * 60_000, enabled);
export function useSafety(lat: number, lon: number, enabled = true) {
  return usePersistedQuery<Envelope<SafetyData>>(`safety:${snap(lat)},${snap(lon)}`, `/api/safety?lat=${snap(lat)}&lon=${snap(lon)}`, 10 * 60_000, enabled);
}
export function useClearNow(lat: number, lon: number, enabled: boolean) {
  return usePersistedQuery<Envelope<ClearNow>>(`clear:${snap(lat)},${snap(lon)}`, `/api/clear-now?lat=${snap(lat)}&lon=${snap(lon)}`, 3 * 60_000, enabled);
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j as T;
}

export const apiUrl = (p: string) => `${API_BASE}${p}`;

/** Score weights from config/score-weights.json (server); defaults until loaded / offline. */
export function useWeights(): { weights: Weights; version: string } {
  const q = usePersistedQuery<{ data: { version: string; weights: Weights } }>('score-weights', '/api/score-weights', 30 * 60_000);
  const raw = q.data?.data;
  return useMemo(() => ({ weights: resolveWeights(raw?.weights ?? null), version: raw?.version ?? 'default' }), [raw]);
}

export interface RoadPoint {
  name: string;
  lat: number;
  lon: number;
  gustMs: number | null;
  windMs: number | null;
  roadC: number | null;
  airC: number | null;
  time: string | null;
  kind: 'clear' | 'slippery' | 'closed' | 'wind' | 'unknown';
  condition: string | null;
}
export const useRoads = (enabled = true) => usePersistedQuery<Envelope<RoadPoint[]>>('roads', '/api/roads', 10 * 60_000, enabled);
export const useWarnings = () => usePersistedQuery<Envelope<SafetyData['warnings']>>('warnings', '/api/warnings', 10 * 60_000);
/** Corridor + the real road route (or why we fell back to a straight line). */
export type RouteResult = Corridor & { route: (RoadRoute & { provider: string }) | null; fallback: string | null };
export function useRoute(from: { lat: number; lon: number }, to: { lat: number; lon: number } | null) {
  const f = `${snap(from.lat)},${snap(from.lon)}`;
  const t = to ? `${to.lat.toFixed(3)},${to.lon.toFixed(3)}` : '';
  return usePersistedQuery<Envelope<RouteResult>>(`route:${f}:${t}`, `/api/route?fromLat=${snap(from.lat)}&fromLon=${snap(from.lon)}&toLat=${to?.lat}&toLon=${to?.lon}`, 10 * 60_000, !!to);
}

/** IANA timezone of a place (cached for days; times then render in the place's local time). */
export function useTimeZone(lat: number, lon: number) {
  return usePersistedQuery<Envelope<{ timezone: string | null; utcOffsetSec: number | null }>>(
    `tz:${Math.round(lat * 2) / 2},${Math.round(lon * 2) / 2}`,
    `/api/timezone?lat=${snap(lat)}&lon=${snap(lon)}`,
    24 * 3600_000,
  );
}

export function useOutlook(lat: number, lon: number, astro: boolean, enabled = true) {
  return usePersistedQuery<Envelope<{ location: { lat: number; lon: number }; nights: NightOutlook[] }>>(
    `outlook:${snap(lat)},${snap(lon)}:${astro ? 'a' : 'n'}`,
    `/api/outlook?lat=${snap(lat)}&lon=${snap(lon)}${astro ? '&dark=astro' : ''}`,
    30 * 60_000,
    enabled,
  );
}
