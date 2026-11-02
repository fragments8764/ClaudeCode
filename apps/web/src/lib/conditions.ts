import {
  bestWindow,
  computeScore,
  effectiveCloud,
  hourlyOutlook,
  kpAt,
  moonState,
  planNight,
  sunAltitudeDeg,
  sunState,
  type BestWindow,
  type NightPlan,
  type ScoreResult,
  type SunState,
} from '@nordurljos/core';
import { useMemo } from 'react';
import { useNow } from '../hooks/useNow';
import { skyParams, type SkyParams } from '../sky/skyParams';
import { useAurora, useClouds, useSpaceWeather } from './api';
import { useSettings } from './store';

/**
 * Preview mode for design review: ?demo=storm | active | quiet overrides the live inputs
 * for the score and sky (clearly badged in the UI). Never used for real decisions.
 */
const DEMOS = {
  storm: { kp: 7.3, bz: -18, speed: 720, cloud: 5, ovation: 55 },
  active: { kp: 4.3, bz: -6, speed: 520, cloud: 15, ovation: 22 },
  quiet: { kp: 1.7, bz: 2, speed: 360, cloud: 10, ovation: 6 },
} as const;
const demoKey = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null;
export const DEMO = demoKey && demoKey in DEMOS ? DEMOS[demoKey as keyof typeof DEMOS] : null;
export const DEMO_NAME = DEMO ? demoKey : null;

export interface Conditions {
  now: Date;
  sun: SunState;
  plan: NightPlan;
  /** null until we have at least one live input */
  score: ScoreResult | null;
  best: BestWindow | null;
  sky: SkyParams;
  sw: ReturnType<typeof useSpaceWeather>;
  clouds: ReturnType<typeof useClouds>;
  aurora: ReturnType<typeof useAurora>;
  loading: boolean;
  /** Oldest fetch time among live sources (for "updated x ago"). */
  updatedAt: string | null;
  anyStale: boolean;
}

/**
 * One hook = everything the Tonight screen needs. Score is computed on-device with the
 * same pure function the server uses, so it keeps updating offline (astronomy changes
 * minute to minute) from the last cached data.
 */
export function useConditions(): Conditions {
  const location = useSettings((s) => s.location);
  const now = useNow(60_000);
  const sw = useSpaceWeather();
  const clouds = useClouds(location.lat, location.lon);
  const aurora = useAurora(location.lat, location.lon);

  const plan = useMemo(() => planNight(now, location.lat, location.lon, 24, 5), [now, location.lat, location.lon]);
  const sun = useMemo(() => sunState(now, location.lat, location.lon), [now, location.lat, location.lon]);

  const swd = sw.data?.data;
  const cd = clouds.data?.data;
  const ad = aurora.data?.data;

  const score = useMemo(() => {
    if (DEMO) return computeScore({ ...DEMO, sunAltDeg: -25, moonAltDeg: -5, moonIllumination: 0.2 });
    if (!swd && !cd && !ad) return null;
    return computeScore({
      sunAltDeg: sun.altitudeDeg,
      moonAltDeg: plan.moon.altitudeDeg,
      moonIllumination: plan.moon.illumination,
      cloud: cd?.effective ?? null,
      ovation: ad?.visible ?? null,
      kp: swd?.kp.now?.kp ?? null,
      bz: swd?.solarWind.bzAvg15m ?? null,
      speed: swd?.solarWind.latest?.speed ?? null,
    });
  }, [swd, cd, ad, sun.altitudeDeg, plan.moon.altitudeDeg, plan.moon.illumination]);

  const best = useMemo(() => {
    if (!cd) return null;
    const startHour = now.toISOString().slice(0, 13);
    const hours = cd.hourly
      .filter((h) => h.time >= startHour && new Date(h.time).getTime() - now.getTime() <= 18 * 3.6e6)
      .map((h) => ({ time: h.time, cloud: effectiveCloud(h), kp: swd ? kpAt(swd.kp.series, new Date(h.time)) : null }));
    const out = hourlyOutlook(hours, (d) => {
      const m = moonState(d, location.lat, location.lon);
      return { sunAlt: sunAltitudeDeg(d, location.lat, location.lon), moonAlt: m.altitudeDeg, moonIllumination: m.illumination };
    });
    return bestWindow(out, 2);
  }, [cd, swd, now, location.lat, location.lon]);

  const sky = useMemo(
    () =>
      skyParams({
        kp: DEMO?.kp ?? swd?.kp.now?.kp ?? null,
        bz: DEMO?.bz ?? swd?.solarWind.bzAvg15m ?? null,
        speed: DEMO?.speed ?? swd?.solarWind.latest?.speed ?? null,
        score: score?.score ?? null,
        darkness: DEMO ? 1 : sun.darknessFactor,
      }),
    [swd, score?.score, sun.darknessFactor],
  );

  const metas = [...(sw.data?.meta.sources ?? []), ...(clouds.data?.meta.sources ?? []), ...(aurora.data?.meta.sources ?? [])];
  const times = metas.map((m) => m.fetchedAt).filter((t): t is string => !!t).sort();

  return {
    now,
    sun,
    plan,
    score,
    best,
    sky,
    sw,
    clouds,
    aurora,
    loading: !score && (sw.isLoading || clouds.isLoading || aurora.isLoading),
    updatedAt: times[0] ?? null,
    anyStale: metas.some((m) => m.stale),
  };
}
