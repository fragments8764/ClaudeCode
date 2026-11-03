import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import {
  bestWindow,
  bucketAverage,
  combineClouds,
  computeScore,
  hourlyOutlook,
  isValidLatLon,
  kpAt,
  kpToGScale,
  lastMinutes,
  latestAtOrBefore,
  moonState,
  ovationAt,
  parseKpForecast,
  parseKpObserved,
  parseMetNo,
  parseOpenMeteo,
  parseOvation,
  parseRtswMag,
  parseRtswWind,
  snapCoord,
  sunAltitudeDeg,
  effectiveCloud,
  type ImfPoint,
  type KpPoint,
  type SolarWindPoint,
} from '@nordurljos/core';
import { Fetcher, type FetchResult } from './lib/fetcher';
import { SOURCES, type SourceId } from './lib/sources';
import { ConfigLoader, type CameraDef } from './lib/config';
import { registerExtras, type SendPush } from './routes/extras';
import type { Spot } from '@nordurljos/core';

export const UPSTREAM = {
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  kpForecast: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
  rtswWind: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
  rtswMag: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
  ovation: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
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

export function meta<T>(id: SourceId, r: PromiseSettledResult<FetchResult<T>>): SourceMeta {
  const s = SOURCES[id];
  const base = { id: s.id, name: s.name, attribution: s.attribution, homepage: s.homepage };
  if (r.status === 'fulfilled') return { ...base, ok: true, stale: r.value.stale, fetchedAt: r.value.fetchedAt };
  return { ...base, ok: false, stale: false, fetchedAt: null, error: (r.reason as Error)?.message ?? 'failed' };
}

const val = <T>(r: PromiseSettledResult<FetchResult<T>>): T | null => (r.status === 'fulfilled' ? r.value.value : null);

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

export function parseLatLon(q: (k: string) => string | undefined) {
  const lat = Number(q('lat'));
  const lon = Number(q('lon'));
  if (!isValidLatLon(lat, lon)) return null;
  // Snap to ~5 km: better cache hit rate, and we never forward a precise location upstream.
  return { lat: snapCoord(lat), lon: snapCoord(lon) };
}

export interface AppOptions {
  fetcher: Fetcher;
  corsOrigin?: string;
  now?: () => Date;
  /** config/ directory (spots, cameras); null = use `inlineConfig` (tests) */
  configDir?: string | null;
  inlineConfig?: { spots?: Spot[]; cameras?: CameraDef[] };
  /** data/ directory for subscriptions, sightings, VAPID keys; null = memory only */
  dataDir?: string | null;
  vapid?: { publicKey: string; privateKey: string; subject: string } | null;
  sendPush?: SendPush;
}

export function createApp({ fetcher, corsOrigin = '*', now = () => new Date(), configDir = null, inlineConfig, dataDir = null, vapid = null, sendPush }: AppOptions) {
  const app = new Hono();
  const started = now();

  // ---- data assemblers (shared by several routes) ----

  async function spaceWeather() {
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

    const fcNow = kpFc ? latestAtOrBefore(kpFc, t) : null;
    const obsNow = kpObs ? kpObs[kpObs.length - 1]! : null;
    const kpNow: KpPoint | null = fcNow && (!obsNow || fcNow.time >= obsNow.time) ? fcNow : obsNow;
    const upcoming = kpFc ? kpFc.filter((p) => p.time > t.toISOString()) : [];
    const next24 = upcoming.filter((p) => new Date(p.time).getTime() - t.getTime() <= 24 * 3.6e6);
    const max24 = next24.reduce<KpPoint | null>((a, b) => (!a || b.kp > a.kp ? b : a), null);

    const wind6h: SolarWindPoint[] = w ? bucketAverage(lastMinutes(w.series, 360), 5, ['speed', 'density']) : [];
    const mag6h: ImfPoint[] = m ? bucketAverage(lastMinutes(m.series, 360), 5, ['bt', 'bz']) : [];
    const bzVals = (m ? lastMinutes(m.series, 15) : []).map((p) => p.bz).filter((v): v is number => v !== null);
    const bzAvg15 = bzVals.length ? Number((bzVals.reduce((s, v) => s + v, 0) / bzVals.length).toFixed(2)) : null;
    const latestWind = w ? w.series[w.series.length - 1]! : null;
    const latestMag = m ? m.series[m.series.length - 1]! : null;

    return {
      data: {
        kp: {
          now: kpNow,
          gScaleNow: kpNow ? kpToGScale(kpNow.kp) : null,
          max24h: max24,
          gScaleMax24h: max24 ? kpToGScale(max24.kp) : null,
          series: kpFc ? kpFc.filter((p) => new Date(p.time).getTime() >= t.getTime() - 24 * 3.6e6) : (kpObs ?? []).slice(-8),
        },
        solarWind: {
          spacecraft: w?.spacecraft ?? m?.spacecraft ?? null,
          latest: (latestWind || latestMag
            ? {
                speed: latestWind?.speed ?? null,
                density: latestWind?.density ?? null,
                bt: latestMag?.bt ?? null,
                bz: latestMag?.bz ?? null,
                time: [latestWind?.time, latestMag?.time].filter(Boolean).sort().pop()!,
              }
            : null) as (SolarWindPoint & ImfPoint) | null,
          windTime: latestWind?.time ?? null,
          magTime: latestMag?.time ?? null,
          bzAvg15m: bzAvg15,
          wind6h,
          mag6h,
        },
      },
      sources: [meta('noaa-kp', kp), meta('noaa-kp-forecast', kpf), meta('noaa-rtsw-wind', wind), meta('noaa-rtsw-mag', mag)],
    };
  }

  async function clouds(lat: number, lon: number) {
    const key = `${lat},${lon}`;
    const [om, mn] = await Promise.allSettled([
      fetcher.get('open-meteo', UPSTREAM.openMeteo(lat, lon), parseOpenMeteoWithExtras, key),
      fetcher.get('met-norway', UPSTREAM.metNo(lat, lon), (raw) => parseMetNo(raw, now()), key),
    ]);
    const omv = val(om);
    const mnv = val(mn);
    const sources = [meta('open-meteo', om), meta('met-norway', mn)];
    if (!omv && !mnv) return { data: null, sources };
    // A cached MET Norway parse may be up to TTL old; recompute "current" relative to now.
    const metNoNow = mnv ? { ...mnv, current: nearest(mnv.hourly, now()) } : null;
    const consensus = combineClouds([omv?.clouds ?? null, metNoNow]);
    const tIso = new Date(now().getTime() - 3.6e6).toISOString();
    return {
      data: {
        location: { lat, lon },
        ...consensus,
        hourly: consensus.hourly.filter((h) => h.time >= tIso).slice(0, 49),
        weather: omv?.extras ?? null,
      },
      sources,
    };
  }

  async function aurora(lat: number, lon: number) {
    const [ov] = await Promise.allSettled([fetcher.get('noaa-ovation', UPSTREAM.ovation, parseOvation)]);
    const grid = val(ov);
    return { data: grid ? ovationAt(grid, lat, lon) : null, sources: [meta('noaa-ovation', ov)] };
  }

  // ---- routes ----

  // gzip/deflate JSON and static assets (CompressionStream; skipped for images and tiny bodies)
  app.use('*', compress());
  app.use('/api/*', cors({ origin: corsOrigin, allowMethods: ['GET', 'POST'] }));
  app.use('/api/*', async (c, next) => {
    await next();
    if (c.res.status === 200 && !c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'public, max-age=60');
  });

  app.get('/api/health', (c) => {
    c.header('Cache-Control', 'no-store');
    const sources = fetcher.healthReport().map((h) => {
      const s = SOURCES[h.id as SourceId];
      return { ...h, attribution: s.attribution, homepage: s.homepage, ttlSeconds: s.ttlMs / 1000 };
    });
    const degraded = sources.some((s) => s.breaker !== 'closed' || s.consecutiveFailures > 0);
    return c.json({ status: degraded ? 'degraded' : 'ok', startedAt: started.toISOString(), now: now().toISOString(), cacheEntries: fetcher.cache.size, sources });
  });

  app.get('/api/space-weather', async (c) => {
    const sw = await spaceWeather();
    return c.json({ data: sw.data, meta: { generatedAt: now().toISOString(), sources: sw.sources } });
  });

  app.get('/api/clouds', async (c) => {
    const ll = parseLatLon((k) => c.req.query(k));
    if (!ll) return c.json({ error: 'lat and lon query parameters are required and must be valid' }, 400);
    const r = await clouds(ll.lat, ll.lon);
    const metaBlock = { generatedAt: now().toISOString(), sources: r.sources };
    if (!r.data) return c.json({ error: 'All cloud sources unavailable', meta: metaBlock }, 503);
    return c.json({ data: r.data, meta: metaBlock });
  });

  /** OVATION at a location: overhead + distance-weighted "visible" value. */
  app.get('/api/aurora', async (c) => {
    const ll = parseLatLon((k) => c.req.query(k));
    if (!ll) return c.json({ error: 'lat and lon query parameters are required and must be valid' }, 400);
    const r = await aurora(ll.lat, ll.lon);
    const metaBlock = { generatedAt: now().toISOString(), sources: r.sources };
    if (!r.data) return c.json({ error: 'OVATION unavailable', meta: metaBlock }, 503);
    return c.json({ data: { location: ll, ...r.data }, meta: metaBlock });
  });

  /**
   * Composite Aurora Score for a location, computed server-side with the same pure
   * function the app uses. Intended for widgets, share cards and alerts.
   */
  app.get('/api/score', async (c) => {
    const ll = parseLatLon((k) => c.req.query(k));
    if (!ll) return c.json({ error: 'lat and lon query parameters are required and must be valid' }, 400);
    const r = await scoreAt(ll.lat, ll.lon);
    return c.json({ data: r.data, meta: { generatedAt: now().toISOString(), sources: r.sources } });
  });

  /**
   * Composite Aurora Score for a location, computed server-side with the same pure
   * function the app uses. Used by /api/score, widgets, share cards and the alert poller.
   */
  async function scoreAt(lat: number, lon: number) {
    const ll = { lat, lon };
    const [sw, cl, au] = await Promise.all([spaceWeather(), clouds(ll.lat, ll.lon), aurora(ll.lat, ll.lon)]);
    const t = now();
    const moon = moonState(t, ll.lat, ll.lon);
    const result = computeScore({
      sunAltDeg: sunAltitudeDeg(t, ll.lat, ll.lon),
      moonAltDeg: moon.altitudeDeg,
      moonIllumination: moon.illumination,
      cloud: cl.data?.effective ?? null,
      ovation: au.data?.visible ?? null,
      kp: sw.data.kp.now?.kp ?? null,
      bz: sw.data.solarWind.bzAvg15m,
      speed: sw.data.solarWind.latest?.speed ?? null,
    });
    const kpSeries = sw.data.kp.series;
    const outlook = hourlyOutlook(
      (cl.data?.hourly ?? [])
        .filter((h) => h.time >= t.toISOString().slice(0, 13) && new Date(h.time).getTime() - t.getTime() <= 18 * 3.6e6)
        .map((h) => ({ time: h.time, cloud: effectiveCloud(h), kp: kpAt(kpSeries, new Date(h.time)) })),
      (d) => {
        const m = moonState(d, ll.lat, ll.lon);
        return { sunAlt: sunAltitudeDeg(d, ll.lat, ll.lon), moonAlt: m.altitudeDeg, moonIllumination: m.illumination };
      },
    );
    return {
      data: { location: ll, ...result, best: bestWindow(outlook), outlook },
      sources: [...sw.sources, ...cl.sources, ...au.sources],
      raw: { sw: sw.data, clouds: cl.data, aurora: au.data },
    };
  }

  const config = new ConfigLoader(configDir, inlineConfig);
  const services = registerExtras(app, { fetcher, now, config, dataDir, vapid, sendPush, spaceWeather, clouds, aurora, scoreAt, parseLatLon, meta });

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'not found' }, 404) : c.text('Not found', 404)));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: 'internal error' }, 500);
  });

  return Object.assign(app, { services });
}
