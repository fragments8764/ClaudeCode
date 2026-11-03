import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { snapCoord } from '@nordurljos/core';
import type { ValueGrid, Spot } from '@nordurljos/core';
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
  const q = useQuery({
    queryKey: [key],
    queryFn: () => getJson<T>(path),
    enabled,
    refetchInterval: refetchMs,
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
