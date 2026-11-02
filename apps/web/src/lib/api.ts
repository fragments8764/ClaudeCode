import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { snapCoord } from '@nordurljos/core';
import type { AuroraAt, Clouds, Envelope, Health, SpaceWeather } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function getJson<T>(path: string, timeoutMs = 12_000): Promise<T> {
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
