import type { ImfPoint, SolarWindPoint } from './types';
import { isRecord, isoUtc, num, ParseError } from './parse/util';

/**
 * SUBSTORM NOWCAST
 * Heuristic, not a forecast model. Energy loads into the magnetotail while Bz is south;
 * substorm onsets typically follow 30–60 min of sustained southward Bz. A ground
 * magnetometer showing a sharp negative bay in H is the "it's kicking off now" signal.
 */
export type NowcastLevel = 'quiet' | 'loading' | 'likely' | 'onset';

export interface Nowcast {
  level: NowcastLevel;
  headline: string;
  detail: string;
  /** Minutes Bz has been continuously south (≤ −2 nT), within the last 2 h. */
  southMinutes: number;
  bzAvg30: number | null;
  /** Ground magnetometer H drop vs. quiet baseline (nT), if available. */
  groundBay: number | null;
}

export interface GroundMag {
  station: string;
  name: string;
  /** minute samples, oldest first, horizontal-north component in nT */
  series: { time: string; x: number }[];
}

/** Parse INTERMAGNET GIN JSON (datetime[], X[]...). Filters fill values (≥ 88888). */
export function parseGinMag(data: unknown, station: string): GroundMag {
  if (!isRecord(data) || !Array.isArray(data.datetime) || !Array.isArray(data.X)) throw new ParseError('gin-mag', 'unexpected shape');
  const info = isRecord(data['@info']) ? data['@info'] : {};
  const series: { time: string; x: number }[] = [];
  data.datetime.forEach((t, i) => {
    const time = isoUtc(t);
    const x = num((data.X as unknown[])[i]);
    if (time && x !== null && Math.abs(x) < 88888) series.push({ time, x });
  });
  if (series.length < 10) throw new ParseError('gin-mag', 'too few samples');
  return { station, name: typeof info.station_name === 'string' ? info.station_name : station, series };
}

/** Negative bay depth: median of the first 2/3 of the last 3 h minus the min of the last 30 min. */
export function groundBay(mag: GroundMag): { bay: number; rangeLastHour: number; latest: string } {
  const s = mag.series;
  const end = new Date(s[s.length - 1]!.time).getTime();
  const last3h = s.filter((p) => new Date(p.time).getTime() >= end - 3 * 3.6e6);
  const base = last3h.slice(0, Math.max(1, Math.floor(last3h.length * 0.66))).map((p) => p.x).sort((a, b) => a - b);
  const median = base[Math.floor(base.length / 2)]!;
  const last30 = s.filter((p) => new Date(p.time).getTime() >= end - 30 * 60_000).map((p) => p.x);
  const lastHour = s.filter((p) => new Date(p.time).getTime() >= end - 60 * 60_000).map((p) => p.x);
  return {
    bay: Math.round(median - Math.min(...last30)),
    rangeLastHour: Math.round(Math.max(...lastHour) - Math.min(...lastHour)),
    latest: s[s.length - 1]!.time,
  };
}

export function substormNowcast(mag: ImfPoint[], wind: SolarWindPoint[], ground: GroundMag | null): Nowcast {
  const end = mag.length ? new Date(mag[mag.length - 1]!.time).getTime() : 0;
  const within = (mins: number) => mag.filter((p) => new Date(p.time).getTime() >= end - mins * 60_000);
  const bz30 = within(30).map((p) => p.bz).filter((v): v is number => v !== null);
  const bzAvg30 = bz30.length ? bz30.reduce((s, v) => s + v, 0) / bz30.length : null;
  // continuous south run, counted back from the newest sample
  let southMinutes = 0;
  const recent = within(120);
  for (let i = recent.length - 1; i >= 0; i--) {
    const bz = recent[i]!.bz;
    if (bz === null) continue;
    if (bz > -2) break;
    southMinutes = Math.round((end - new Date(recent[i]!.time).getTime()) / 60_000);
  }
  const speed = wind.length ? wind[wind.length - 1]!.speed ?? 400 : 400;
  const g = ground ? groundBay(ground) : null;

  let level: NowcastLevel = 'quiet';
  if (g && g.bay >= 150) level = 'onset';
  else if (bzAvg30 !== null && bzAvg30 <= -5 && southMinutes >= 30) level = 'likely';
  else if (bzAvg30 !== null && bzAvg30 <= -5 && southMinutes >= 15 && speed >= 500) level = 'likely';
  else if (southMinutes >= 10) level = 'loading'; // every sample in the run is ≤ −2 nT

  const copy: Record<NowcastLevel, [string, string]> = {
    quiet: ['No substorm signal', 'Bz isn’t holding south, so energy isn’t building up in Earth’s magnetic tail.'],
    loading: ['Energy is loading', `Bz has been south for ${southMinutes} min. Keep an eye on the sky.`],
    likely: ['Burst likely in 30–60 min', `Bz has been south for ${southMinutes} min (avg ${bzAvg30?.toFixed(1)} nT). Get to your spot.`],
    onset: ['It’s kicking off now', `The ground magnetometer at ${ground?.name ?? 'a nearby station'} shows a ${g?.bay} nT drop. Look up!`],
  };
  return { level, headline: copy[level][0], detail: copy[level][1], southMinutes, bzAvg30: bzAvg30 === null ? null : Math.round(bzAvg30 * 10) / 10, groundBay: g?.bay ?? null };
}
