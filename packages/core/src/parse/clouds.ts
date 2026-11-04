import { haversineKm } from '../geo';
import type { CloudForecast, CloudLayers } from '../types';
import { isRecord, isoUtc, num, ParseError } from './util';

/**
 * Cloud cover parsers.
 *
 * Verified 2026-11-02:
 *  - Open-Meteo /v1/forecast with current & hourly cloud_cover{,_low,_mid,_high}, timezone=GMT.
 *  - MET Norway locationforecast/2.0/complete → instant.details.cloud_area_fraction{,_low,_medium,_high}.
 *    (The /compact variant lacks the low/mid/high split.)
 */

const clampPct = (v: number | null) => (v === null ? null : Math.max(0, Math.min(100, v)));

export function parseOpenMeteo(data: unknown): CloudForecast {
  if (!isRecord(data)) throw new ParseError('open-meteo', 'expected object');
  let current: CloudLayers | null = null;
  if (isRecord(data.current)) {
    const c = data.current;
    const time = isoUtc(c.time);
    if (time) {
      current = {
        time,
        total: clampPct(num(c.cloud_cover)),
        low: clampPct(num(c.cloud_cover_low)),
        mid: clampPct(num(c.cloud_cover_mid)),
        high: clampPct(num(c.cloud_cover_high)),
      };
    }
  }
  const hourly: CloudLayers[] = [];
  if (isRecord(data.hourly) && Array.isArray(data.hourly.time)) {
    const h = data.hourly as Record<string, unknown[]>;
    const at = (k: string, i: number) => clampPct(num(Array.isArray(h[k]) ? h[k]![i] : null));
    h.time!.forEach((t, i) => {
      const time = isoUtc(t);
      if (!time) return;
      hourly.push({ time, total: at('cloud_cover', i), low: at('cloud_cover_low', i), mid: at('cloud_cover_mid', i), high: at('cloud_cover_high', i) });
    });
  }
  if (!current && !hourly.length) throw new ParseError('open-meteo', 'no cloud data');
  return { source: 'open-meteo', current, hourly };
}

export function parseMetNo(data: unknown, now = new Date()): CloudForecast {
  if (!isRecord(data) || !isRecord(data.properties) || !Array.isArray(data.properties.timeseries)) {
    throw new ParseError('met-norway', 'unexpected shape');
  }
  const hourly: CloudLayers[] = [];
  for (const step of data.properties.timeseries) {
    if (!isRecord(step) || !isRecord(step.data) || !isRecord(step.data.instant)) continue;
    const d = step.data.instant.details;
    const time = isoUtc(step.time);
    if (!time || !isRecord(d)) continue;
    hourly.push({
      time,
      total: clampPct(num(d.cloud_area_fraction)),
      low: clampPct(num(d.cloud_area_fraction_low)),
      mid: clampPct(num(d.cloud_area_fraction_medium)),
      high: clampPct(num(d.cloud_area_fraction_high)),
    });
  }
  if (!hourly.length) throw new ParseError('met-norway', 'no timeseries');
  hourly.sort((a, b) => a.time.localeCompare(b.time));
  return { source: 'met-norway', current: nearestInTime(hourly, now, 90), hourly };
}

/** Closest point to `now` within `maxMinutes`, else null. */
export function nearestInTime<T extends { time: string }>(series: T[], now: Date, maxMinutes: number): T | null {
  let best: T | null = null;
  let bestDiff = Infinity;
  for (const p of series) {
    const diff = Math.abs(new Date(p.time).getTime() - now.getTime());
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  return bestDiff <= maxMinutes * 60_000 ? best : null;
}

/**
 * "Sky-blocking" cloud: how much of the sky is effectively hidden for aurora watching.
 * High cloud (cirrus) is often thin and aurora shines through, so it counts at 50%.
 * Layers are combined assuming random overlap: 1 − Π(1 − cᵢ).
 * Falls back to total cover if layers are missing.
 */
export const HIGH_CLOUD_WEIGHT = 0.5;
export function effectiveCloud(c: Pick<CloudLayers, 'total' | 'low' | 'mid' | 'high'>): number | null {
  if (c.low === null || c.mid === null || c.high === null) return c.total;
  const clear = (1 - c.low / 100) * (1 - c.mid / 100) * (1 - (HIGH_CLOUD_WEIGHT * c.high) / 100);
  const eff = 100 * (1 - clear);
  // never exceed reported total by much (layers can't add up beyond the total model value)
  return Math.round(c.total === null ? eff : Math.min(eff, c.total));
}

export type Confidence = 'high' | 'medium' | 'low' | 'single-source' | 'none';

export interface CloudConsensus {
  current: CloudLayers | null;
  effective: number | null;
  confidence: Confidence;
  /** Absolute difference in total cover between the two sources, if both present. */
  spread: number | null;
  perSource: { source: CloudForecast['source']; current: CloudLayers | null }[];
  hourly: CloudLayers[];
  /** Set when a nearby real observation settled a disagreement between the models. */
  observed?: { name: string; distanceKm: number; time: string; percent: number; picked: CloudForecast['source'] } | null;
  /** Why the real-sky check could not run (models disagree but no usable sensor). */
  crossCheck?: string | null;
}

export interface NearbyCloudObservation {
  name: string;
  distanceKm: number;
  time: string;
  /** lowest-layer cloud amount, oktas 0–8 (IMO ceilometer) */
  oktas: number;
}

/**
 * When the two models disagree badly (spread > 35, "low" confidence), averaging them hides
 * the truth (audit: Reykjavík showed 61 % while Open-Meteo said 91 % and MET Norway 31 %).
 * If a ceilometer within 40 km reported in the last 90 min, trust the model closest to it.
 */
export function arbitrateClouds(c: CloudConsensus, obs: NearbyCloudObservation | null, now: Date): CloudConsensus {
  if (c.confidence !== 'low' || !obs || obs.distanceKm > 40) return c;
  if (now.getTime() - Date.parse(obs.time) > 90 * 60_000) return c;
  const percent = Math.round((obs.oktas / 8) * 100);
  const cands = c.perSource.filter((p) => p.current?.total != null);
  if (cands.length < 2) return c;
  const pick = cands.reduce((a, b) => (Math.abs(a.current!.total! - percent) <= Math.abs(b.current!.total! - percent) ? a : b));
  const current = pick.current!;
  return { ...c, current, effective: effectiveCloud(current), confidence: 'medium', observed: { name: obs.name, distanceKm: obs.distanceKm, time: obs.time, percent, picked: pick.source } };
}

const avg = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.round((a + b) / 2));

/**
 * Cross-check two cloud sources. Agreement within 15 pts → high, 35 → medium, else low.
 * Hourly series is the average of both where timestamps match, else whichever exists.
 */
export function combineClouds(forecasts: (CloudForecast | null)[]): CloudConsensus {
  const fs = forecasts.filter((f): f is CloudForecast => f !== null);
  const withCurrent = fs.filter((f) => f.current);
  const perSource = fs.map((f) => ({ source: f.source, current: f.current }));

  let current: CloudLayers | null = null;
  let confidence: Confidence = 'none';
  let spread: number | null = null;
  if (withCurrent.length >= 2) {
    const [a, b] = [withCurrent[0]!.current!, withCurrent[1]!.current!];
    current = {
      time: a.time > b.time ? a.time : b.time,
      total: avg(a.total, b.total),
      low: avg(a.low, b.low),
      mid: avg(a.mid, b.mid),
      high: avg(a.high, b.high),
    };
    spread = a.total !== null && b.total !== null ? Math.round(Math.abs(a.total - b.total)) : null;
    confidence = spread === null ? 'medium' : spread <= 15 ? 'high' : spread <= 35 ? 'medium' : 'low';
  } else if (withCurrent.length === 1) {
    current = withCurrent[0]!.current;
    confidence = 'single-source';
  }

  const byTime = new Map<string, CloudLayers[]>();
  for (const f of fs) for (const h of f.hourly) byTime.set(h.time, [...(byTime.get(h.time) ?? []), h]);
  const hourly = [...byTime.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([time, arr]) => ({
      time,
      total: arr.map((x) => x.total).reduce(avg, null),
      low: arr.map((x) => x.low).reduce(avg, null),
      mid: arr.map((x) => x.mid).reduce(avg, null),
      high: arr.map((x) => x.high).reduce(avg, null),
    }));

  return { current, effective: current ? effectiveCloud(current) : null, confidence, spread, perSource, hourly };
}

/**
 * Pick the sensor that may settle a model disagreement: the nearest one within 40 km that
 * reported in the last 90 min (the very nearest often lags), or say why none can.
 */
export function chooseCloudSensor(
  sensors: { name: string; time: string; oktas: number | null; lat: number; lon: number }[] | null,
  here: { lat: number; lon: number },
  now: Date,
  maxKm = 40,
  maxAgeMin = 90,
): { sensor: NearbyCloudObservation | null; reason: string | null } {
  if (!sensors) return { sensor: null, reason: 'The Icelandic Met Office cloud sensors are not answering right now, so we could not check the real sky.' };
  const near = sensors
    .filter((o) => o.oktas != null)
    .map((o) => ({ name: o.name, time: o.time, oktas: o.oktas!, distanceKm: Math.round(haversineKm(here, o)) }))
    .filter((o) => o.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  if (!near.length) return { sensor: null, reason: `No cloud sensor within ${maxKm} km of here, so we could not check the real sky.` };
  const fresh = near.find((o) => now.getTime() - Date.parse(o.time) <= maxAgeMin * 60_000);
  if (fresh) return { sensor: fresh, reason: null };
  const age = Math.round((now.getTime() - Date.parse(near[0]!.time)) / 60_000);
  return { sensor: null, reason: `The nearest cloud sensors (${near[0]!.name}, ${near[0]!.distanceKm} km) have not reported for ${age} min, so we could not check the real sky.` };
}
