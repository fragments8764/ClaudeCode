import { haversineKm, rankSpots, snapCoord, type Spot } from '@nordurljos/core';
import { apiUrl, getJson } from './api';
import { tilesAround } from './offlineMap';
import type { Camera } from './types';

/**
 * "Prepare for tonight's drive": pull everything the field needs into the service-worker
 * caches while there's signal — forecast, score, clouds, aurora, safety for your location and
 * the best spots nearby, camera snapshots, spots, map tiles within the pinned radius.
 */
export interface PrepStep {
  label: string;
  done: number;
  total: number;
}

export async function prepareForTonight(
  at: { lat: number; lon: number },
  radiusKm: number,
  onStep: (s: PrepStep) => void,
  signal?: AbortSignal,
): Promise<{ requests: number; failed: number }> {
  let requests = 0;
  let failed = 0;
  const hit = async (url: string) => {
    requests++;
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) failed++;
    } catch {
      failed++;
    }
  };
  const run = async (label: string, urls: string[], conc = 6) => {
    let done = 0;
    onStep({ label, done, total: urls.length });
    const q = [...urls];
    await Promise.all(
      Array.from({ length: conc }, async () => {
        while (q.length && !signal?.aborted) {
          await hit(q.shift()!);
          onStep({ label, done: ++done, total: urls.length });
        }
      }),
    );
  };
  const ll = (p: { lat: number; lon: number }) => `lat=${snapCoord(p.lat)}&lon=${snapCoord(p.lon)}`;

  // 1) forecasts for here
  await run('Forecast for your location', [
    apiUrl('/api/space-weather'),
    apiUrl('/api/nowcast'),
    apiUrl('/api/score-weights'),
    apiUrl(`/api/clouds?${ll(at)}`),
    apiUrl(`/api/aurora?${ll(at)}`),
    apiUrl(`/api/safety?${ll(at)}`),
    apiUrl(`/api/clear-now?${ll(at)}`),
    apiUrl('/api/grid/clouds'),
    apiUrl('/api/grid/ovation'),
    apiUrl('/api/spots'),
    apiUrl('/api/cameras'),
  ]);
  // 2) best spots within reach → their clouds + safety
  try {
    const spots = (await getJson<{ data: Spot[] }>('/api/spots')).data.filter((s) => haversineKm(at, s) <= radiusKm);
    const top = rankSpots(spots, { from: at, at: new Date(), clouds: null, timeIdx: 0, ovation: null, kp: null, bz: null, speed: null, maxKm: radiusKm }).slice(0, 6);
    await run('Spots nearby', top.flatMap((r) => [apiUrl(`/api/clouds?${ll(r.spot)}`), apiUrl(`/api/safety?${ll(r.spot)}`)]));
  } catch {
    failed++;
  }
  // 3) camera snapshots (only embeddable images)
  try {
    const cams = (await getJson<{ data: Camera[] }>('/api/cameras')).data.filter((c) => c.image);
    await run('Camera snapshots', cams.map((c) => apiUrl(c.image!)));
  } catch {
    failed++;
  }
  // 4) map tiles within the pinned radius
  const tiles = await tilesAround(at, radiusKm, signal);
  await run('Map tiles', tiles, 8);
  return { requests, failed };
}
