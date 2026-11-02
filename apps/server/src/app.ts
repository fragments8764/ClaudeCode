import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  bucketAverage,
  combineClouds,
  isValidLatLon,
  kpToGScale,
  lastMinutes,
  latestAtOrBefore,
  parseKpForecast,
  parseKpObserved,
  parseMetNo,
  parseOpenMeteo,
  parseRtswMag,
  parseRtswWind,
  snapCoord,
  type ImfPoint,
  type KpPoint,
  type SolarWindPoint,
} from '@nordurljos/core';
import { Fetcher, type FetchResult } from './lib/fetcher';
import { SOURCES, type SourceId } from './lib/sources';

export const UPSTREAM = {
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  kpForecast: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
  rtswWind: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
  rtswMag: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
  openMeteo: (lat: number, lon: number) =>
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m' +
    '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_hours=48&past_hours=3&timezone=GMT&wind_speed_unit=ms',
  metNo: (lat: number, lon: number) => `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat}&lon=${lon}`,
};

export interface SourceMeta {
  id: string;
  name: string;
  attribution: string;
  homepage: string;
  ok: boolean;
  stale: boolean;
  fetchedAt: string | null;
  error?: string;
}

function meta<T>(id: SourceId, r: PromiseSettledResult<FetchResult<T>>): SourceMeta {
  const s = SOURCES[id];
  const base = { id: s.id, name: s.name, attribution: s.attribution, homepage: s.homepage };
  if (r.status === 'fulfilled') return { ...base, ok: true, stale: r.value.stale, fetchedAt: r.value.fetchedAt };
  return { ...base, ok: false, stale: false, fetchedAt: null, error: (r.reason as Error)?.message ?? 'failed' };
}

const val = <T>(r: PromiseSettledResult<FetchResult<T>>): T | null => (r.status === 'fulfilled' ? r.value.value : null);

/** Extra current-weather fields from Open-Meteo we surface alongside clouds. */
interface OpenMeteoExtras {
  temperature: number | null;
  feelsLike: number | null;
  windSpeed: number | null;
  windGust: number | null;
}

function parseOpenMeteoWithExtras(raw: unknown) {
  const clouds = parseOpenMeteo(raw);
  const c = (raw as { current?: Record<string, unknown> }).current ?? {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const extras: OpenMeteoExtras = {
    temperature: n(c.temperature_2m),
    feelsLike: n(c.apparent_temperature),
    windSpeed: n(c.wind_speed_10m),
    windGust: n(c.wind_gusts_10m),
  };
  return { clouds, extras };
}

export interface AppOptions {
  fetcher: Fetcher;
  corsOrigin?: string;
  now?: () => Date;
}

export function createApp({ fetcher, corsOrigin = '*', now = () => new Date() }: AppOptions) {
  const app = new Hono();
  const started = now();

  app.use('/api/*', cors({ origin: corsOrigin, allowMethods: ['GET'] }));
  app.use('/api/*', async (c, next) => {
    await next();
    if (c.res.status === 200 && !c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'public, max-age=60');
  });

  app.get('/api/health', (c) => {
    c.header('Cache-Control', 'no-store');
    const sources = fetcher.healthReport().map((h) => ({ ...h, ...pick(SOURCES[h.id as SourceId]) }));
    const degraded = sources.some((s) => s.breaker !== 'closed' || s.consecutiveFailures > 0);
    return c.json({
      status: degraded ? 'degraded' : 'ok',
      startedAt: started.toISOString(),
      now: now().toISOString(),
      cacheEntries: fetcher.cache.size,
      sources,
    });
  });

  app.get('/api/space-weather', async (c) => {
    const [kp, kpf, wind, mag] = await Promise.allSettled([
      fetcher.get('noaa-kp', UPSTREAM.kp, parseKpObserved),
      fetcher.get('noaa-kp-forecast', UPSTREAM.kpForecast, parseKpForecast),
      fetcher.get('noaa-rtsw-wind', UPSTREAM.rtswWind, parseRtswWind),
      fetcher.get('noaa-rtsw-mag', UPSTREAM.rtswMag, parseRtswMag),
    ]);
    const t = now();
    const kpObs = val(kp);
    const kpFc = val(kpf);
    const w = val(wind);
    const m = val(mag);

    // Current Kp: best of (latest observed) vs (latest estimated/forecast slot covering now).
    const fcNow = kpFc ? latestAtOrBefore(kpFc, t) : null;
    const obsNow = kpObs ? kpObs[kpObs.length - 1]! : null;
    const kpNow: KpPoint | null = fcNow && (!obsNow || fcNow.time >= obsNow.time) ? fcNow : obsNow;
    const upcoming = kpFc ? kpFc.filter((p) => p.time > t.toISOString()) : [];
    const next24 = upcoming.filter((p) => new Date(p.time).getTime() - t.getTime() <= 24 * 3.6e6);
    const max24 = next24.reduce<KpPoint | null>((a, b) => (!a || b.kp > a.kp ? b : a), null);

    const wind6h: SolarWindPoint[] = w ? bucketAverage(lastMinutes(w.series, 360), 5, ['speed', 'density']) : [];
    const mag6h: ImfPoint[] = m ? bucketAverage(lastMinutes(m.series, 360), 5, ['bt', 'bz']) : [];
    const mag15 = m ? lastMinutes(m.series, 15) : [];
    const bzVals = mag15.map((p) => p.bz).filter((v): v is number => v !== null);
    const bzAvg15 = bzVals.length ? Number((bzVals.reduce((s, v) => s + v, 0) / bzVals.length).toFixed(2)) : null;
    const latestWind = w ? w.series[w.series.length - 1]! : null;
    const latestMag = m ? m.series[m.series.length - 1]! : null;

    return c.json({
      data: {
        kp: {
          now: kpNow,
          gScaleNow: kpNow ? kpToGScale(kpNow.kp) : null,
          max24h: max24,
          gScaleMax24h: max24 ? kpToGScale(max24.kp) : null,
          // last 24h observed + next 72h forecast
          series: kpFc
            ? kpFc.filter((p) => new Date(p.time).getTime() >= t.getTime() - 24 * 3.6e6)
            : (kpObs ?? []).slice(-8),
        },
        solarWind: {
          spacecraft: w?.spacecraft ?? m?.spacecraft ?? null,
          latest: latestWind && latestMag ? { ...latestWind, ...latestMag, time: latestWind.time > latestMag.time ? latestWind.time : latestMag.time } : latestWind ?? latestMag,
          windTime: latestWind?.time ?? null,
          magTime: latestMag?.time ?? null,
          bzAvg15m: bzAvg15,
          wind6h,
          mag6h,
        },
      },
      meta: {
        generatedAt: t.toISOString(),
        sources: [meta('noaa-kp', kp), meta('noaa-kp-forecast', kpf), meta('noaa-rtsw-wind', wind), meta('noaa-rtsw-mag', mag)],
      },
    });
  });

  app.get('/api/clouds', async (c) => {
    const lat = Number(c.req.query('lat'));
    const lon = Number(c.req.query('lon'));
    if (!isValidLatLon(lat, lon)) return c.json({ error: 'lat and lon query parameters are required and must be valid' }, 400);
    // Snap to ~5 km: better cache hit rate, and we never forward a precise location upstream.
    const sLat = snapCoord(lat);
    const sLon = snapCoord(lon);
    const key = `${sLat},${sLon}`;
    const [om, mn] = await Promise.allSettled([
      fetcher.get('open-meteo', UPSTREAM.openMeteo(sLat, sLon), parseOpenMeteoWithExtras, key),
      fetcher.get('met-norway', UPSTREAM.metNo(sLat, sLon), (raw) => parseMetNo(raw, now()), key),
    ]);
    const omv = val(om);
    const mnv = val(mn);
    if (!omv && !mnv) {
      return c.json(
        { error: 'All cloud sources unavailable', meta: { generatedAt: now().toISOString(), sources: [meta('open-meteo', om), meta('met-norway', mn)] } },
        503,
      );
    }
    // A cached MET Norway parse may have been made up to TTL ago; recompute "current" relative to now.
    const metNoNow = mnv ? { ...mnv, current: nearest(mnv.hourly, now()) } : null;
    const consensus = combineClouds([omv?.clouds ?? null, metNoNow]);
    const tIso = new Date(now().getTime() - 3.6e6).toISOString();
    return c.json({
      data: {
        location: { lat: sLat, lon: sLon },
        ...consensus,
        hourly: consensus.hourly.filter((h) => h.time >= tIso).slice(0, 49),
        weather: omv?.extras ?? null,
      },
      meta: { generatedAt: now().toISOString(), sources: [meta('open-meteo', om), meta('met-norway', mn)] },
    });
  });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.text('Not found', 404)));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}

function pick(s: { attribution: string; homepage: string; ttlMs: number }) {
  return { attribution: s.attribution, homepage: s.homepage, ttlSeconds: s.ttlMs / 1000 };
}

function nearest<T extends { time: string }>(series: T[], t: Date): T | null {
  let best: T | null = null;
  let d = Infinity;
  for (const p of series) {
    const x = Math.abs(new Date(p.time).getTime() - t.getTime());
    if (x < d) {
      d = x;
      best = p;
    }
  }
  return d <= 90 * 60_000 ? best : null;
}
