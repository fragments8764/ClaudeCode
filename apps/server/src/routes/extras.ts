import type { Hono } from 'hono';
import {
  bucketAverage,
  evaluateAlerts,
  haversineKm,
  ICELAND_GRID,
  isValidLatLon,
  lastMinutes,
  parseCapWarnings,
  parseCeilometer,
  parseGinMag,
  parseOvation,
  parseRoadConditions,
  parseRoadStations,
  parseRtswMag,
  parseRtswWind,
  parseOpenMeteoGrid,
  planNight,
  pointInPolygon,
  roadsNear,
  snapCoord,
  substormNowcast,
  sunAltitudeDeg,
  darknessFactor,
  calibration,
  eveningOf,
  classifyStation,
  routeCorridor,
  fiveNightOutlook,
  parse27Day,
  parseOpenMeteo,
  verifySighting,
  feedRank,
  type SightingSignals,
  type AlertPrefsLike,
  type AlertRule,
  type GroundMag,
} from '@nordurljos/core';
import type { CameraDef, ConfigLoader } from '../lib/config';
import type { Fetcher, FetchResult } from '../lib/fetcher';
import { FrameStore } from '../lib/frames';
import { RateLimiter } from '../lib/ratelimit';
import { openMeteoHost, openMeteoKey, PROVIDER_TERMS, SOURCES, type SourceId } from '../lib/sources';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { renderAdmin } from './admin';
import { JsonStore } from '../lib/store';

export const UP2 = {
  cloudGrid: (lats: number[], lons: number[]) => {
    const la: number[] = [];
    const lo: number[] = [];
    for (const a of lats) for (const b of lons) (la.push(a), lo.push(b));
    return (
      `${openMeteoHost()}/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}${openMeteoKey()}` +
      '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_hours=48&past_hours=3&timezone=GMT'
    );
  },
  camClouds: (pts: { lat: number; lon: number }[]) =>
    `${openMeteoHost()}/v1/forecast?latitude=${pts.map((p) => p.lat).join(',')}&longitude=${pts.map((p) => p.lon).join(',')}${openMeteoKey()}` +
    '&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&timezone=GMT',
  kp1m: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
  kp27: 'https://services.swpc.noaa.gov/text/27-day-outlook.txt',
  clouds6: (lat: number, lon: number) =>
    `${openMeteoHost()}/v1/forecast?latitude=${lat}&longitude=${lon}${openMeteoKey()}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=6&timezone=GMT`,
  gin: (station: string, day: string) =>
    `https://imag-data.bgs.ac.uk/GIN_V1/GINServices?Request=GetData&format=json&testObsys=0&observatoryIagaCode=${station}&samplesPerDay=minute&publicationState=adj-or-rep&dataStartDate=${day}T00:00:00Z&dataDuration=1`,
  cap: 'https://api.vedur.is/cap/capbroker/active/detailed/all',
  ceilo: 'https://api.vedur.is/weather/observations/aws/raw/cloud/1min/latest',
  imoStations: 'https://api.vedur.is/weather/stations',
  roadWeather: 'https://gagnaveita.vegagerdin.is/api/vedur2014_1',
  roadCond: 'https://gagnaveita.vegagerdin.is/api/faerd2017_1',
  ovation: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  rtswWind: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
  rtswMag: 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json',
};

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lat: number;
  lon: number;
  label: string;
  prefs: AlertPrefsLike;
  createdAt: string;
  lastSent: Partial<Record<AlertRule, string>>;
  /** evening date we last asked "did you see it?" for */
  lastAsked?: string;
}

/** Anonymised score log for validation (location rounded to ~10 km, no identifiers). */
/** Shared trip plan ("tell someone"): public by unguessable id, writable only with the secret. */
export interface TripPlan {
  id: string;
  secret: string;
  name: string;
  destination: { name: string; lat: number; lon: number };
  returnBy: string;
  createdAt: string;
  shareLocation: boolean;
  lastLocation: { lat: number; lon: number; at: string } | null;
  checkedInAt: string | null;
  pushEndpoint: string | null;
  overdueNotified: boolean;
}

export interface ScoreLogEntry {
  at: string;
  lat: number;
  lon: number;
  score: number;
  verdict: string;
  inputs: Record<string, number | null>;
  weightsVersion: string;
}

export interface OutcomeEntry {
  id: string;
  night: string;
  lat: number;
  lon: number;
  saw: boolean;
  brightness: number | null;
  predicted: number | null;
  predictedFrom: 'server-log' | 'client' | null;
  at: string;
}

export interface Sighting {
  id: string;
  at: string;
  lat: number;
  lon: number;
  brightness: number;
  colors: string[];
  direction: string | null;
  /** sha-256 of the owner's delete token (token itself only lives on their device) */
  ownerHash?: string;
  /** fuzzed to ~25 km instead of ~10 km */
  private?: boolean;
  signals?: SightingSignals;
  photo?: boolean;
  /** weekly feed opt-in with the credit the user chose */
  feed?: { credit: string } | null;
  featured?: boolean;
  /** hashed reporter IPs (abuse reports) */
  reports?: string[];
  hidden?: boolean;
}

export type SendPush = (sub: PushSub, payload: { title: string; body: string; url: string; tag: string }) => Promise<{ gone: boolean }>;

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Ctx {
  fetcher: Fetcher;
  now: () => Date;
  config: ConfigLoader;
  dataDir: string | null;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  sendPush?: SendPush;
  spaceWeather: () => Promise<{ data: any; sources: any[] }>;
  clouds: (lat: number, lon: number) => Promise<{ data: any; sources: any[] }>;
  aurora: (lat: number, lon: number) => Promise<{ data: any; sources: any[] }>;
  scoreAt: (lat: number, lon: number) => Promise<{ data: any; sources: any[]; raw: any }>;
  parseLatLon: (q: (k: string) => string | undefined) => { lat: number; lon: number } | null;
  meta: (id: SourceId, r: PromiseSettledResult<FetchResult<unknown>>) => any;
  adminToken?: string | null;
}

const val = <T>(r: PromiseSettledResult<FetchResult<T>>): T | null => (r.status === 'fulfilled' ? r.value.value : null);
const clientIp = (c: { req: { header: (k: string) => string | undefined } }) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';

async function readJson(c: { req: { header: (k: string) => string | undefined; text: () => Promise<string> } }, max = 8192): Promise<unknown> {
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > max) throw new Error('payload too large');
  const t = await c.req.text();
  if (t.length > max) throw new Error('payload too large');
  return JSON.parse(t);
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const COLORS = new Set(['green', 'red', 'purple', 'pink', 'white', 'blue']);

export function registerExtras(app: Hono, ctx: Ctx) {
  const { fetcher, now, config } = ctx;
  const frames = new FrameStore(48);
  const writeLimit = new RateLimiter(8, 10 * 60_000);
  const subs = new JsonStore<PushSub[]>(ctx.dataDir, 'push-subscriptions', []);
  const sightings = new JsonStore<Sighting[]>(ctx.dataDir, 'sightings', []);
  const scoreLog = new JsonStore<ScoreLogEntry[]>(ctx.dataDir, 'score-log', []);
  const outcomes = new JsonStore<OutcomeEntry[]>(ctx.dataDir, 'outcomes', []);
  const lastLogged = new Map<string, number>();
  const plans = new JsonStore<TripPlan[]>(ctx.dataDir, 'plans', []);
  /** Opt-in analytics: anonymous daily counts per event (no IP, no IDs, no locations). */
  const telemetry = new JsonStore<Record<string, Record<string, number>>>(ctx.dataDir, 'telemetry', {});
  /** Opt-in crash reports: message, trimmed stack, app version, browser family, hour. */
  const crashes = new JsonStore<{ at: string; message: string; stack: string; version: string; browser: string }[]>(ctx.dataDir, 'crashes', []);
  const feature = (name: string) => config.features()[name]?.enabled !== false;
  const rid = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

  /** Log a computed score (deduplicated per ~10 km cell per 15 min). */
  function logScore(e: Omit<ScoreLogEntry, 'lat' | 'lon'> & { lat: number; lon: number }) {
    const lat = snapCoord(e.lat, 0.1);
    const lon = snapCoord(e.lon, 0.1);
    const key = `${lat},${lon}`;
    const t = new Date(e.at).getTime();
    if (t - (lastLogged.get(key) ?? 0) < 15 * 60_000) return;
    lastLogged.set(key, t);
    scoreLog.update((all) => [...all, { ...e, lat, lon }].slice(-50_000));
  }

  /** Peak logged score during darkness on a given evening near a point (±0.35°). */
  function peakForNight(night: string, lat: number, lon: number): number | null {
    let peak: number | null = null;
    for (const e of scoreLog.get()) {
      if (Math.abs(e.lat - lat) > 0.35 || Math.abs(e.lon - lon) > 0.7) continue;
      if (eveningOf(e.at) !== night) continue;
      if ((e.inputs.sunAltDeg ?? 0) > -6) continue;
      peak = Math.max(peak ?? 0, e.score);
    }
    return peak;
  }

  // ───────── Map data ─────────
  const cloudGrid = () =>
    fetcher.get('open-meteo-grid', UP2.cloudGrid(ICELAND_GRID.lats, ICELAND_GRID.lons), (raw) => parseOpenMeteoGrid(raw, ICELAND_GRID.lats, ICELAND_GRID.lons), 'iceland-grid');

  app.get('/api/grid/clouds', async (c) => {
    const [r] = await Promise.allSettled([cloudGrid()]);
    const m = { generatedAt: now().toISOString(), sources: [ctx.meta('open-meteo-grid', r)] };
    const g = val(r);
    if (!g) return c.json({ error: 'cloud grid unavailable', meta: m }, 503);
    c.header('Cache-Control', 'public, max-age=600');
    return c.json({ data: g, meta: m });
  });

  app.get('/api/grid/ovation', async (c) => {
    const [r] = await Promise.allSettled([fetcher.get('noaa-ovation', UP2.ovation, parseOvation)]);
    const m = { generatedAt: now().toISOString(), sources: [ctx.meta('noaa-ovation', r)] };
    const g = val(r);
    if (!g) return c.json({ error: 'OVATION unavailable', meta: m }, 503);
    const latMin = 45;
    const latMax = 85;
    const values: number[] = [];
    for (let lat = latMin; lat <= latMax; lat++) for (let lon = 0; lon < 360; lon++) values.push(g.values[(lat + 90) * 360 + lon]!);
    c.header('Cache-Control', 'public, max-age=120');
    return c.json({ data: { latMin, latMax, values, forecastTime: g.forecastTime, observationTime: g.observationTime }, meta: m });
  });

  app.get('/api/spots', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ data: config.spots() });
  });

  // ───────── Cameras ─────────
  const camById = (id: string) => config.cameras().find((x) => x.id === id);
  const camImage = (cam: CameraDef) => fetcher.getImage('camera-image', cam.imageUrl!, `cam:${cam.id}`, (cam.refreshMin ?? 3) * 60_000);

  /** Background capture for the timelapse viewer (called by the Node entry every few minutes). */
  async function captureFrames() {
    for (const cam of config.cameras().filter((x) => x.embed === 'image' && x.imageUrl)) {
      try {
        const r = await camImage(cam);
        if (!r.stale) frames.add(cam.id, { at: r.fetchedAt, contentType: r.value.contentType, bytes: r.value.bytes });
      } catch {
        /* recorded in health */
      }
    }
  }

  app.get('/api/cameras', async (c) => {
    const cams = config.cameras();
    const [cl] = await Promise.allSettled([
      fetcher.get(
        'open-meteo-grid',
        UP2.camClouds(cams.map((x) => ({ lat: snapCoord(x.lat, 0.1), lon: snapCoord(x.lon, 0.1) }))),
        (raw) => {
          const arr = Array.isArray(raw) ? raw : [raw];
          return arr.map((p: any) => (typeof p?.current?.cloud_cover === 'number' ? Math.round(p.current.cloud_cover) : null));
        },
        `cams:${cams.map((x) => x.id).join(',')}`,
      ),
    ]);
    const clouds = val(cl);
    const imgs = await Promise.allSettled(cams.map((cam) => (cam.embed === 'image' && cam.imageUrl ? camImage(cam) : Promise.reject(new Error('link')))));
    const data = cams.map((cam, i) => {
      const r = imgs[i]!;
      const img = r.status === 'fulfilled' ? r.value : null;
      return {
        ...cam,
        imageUrl: undefined,
        image: cam.embed === 'image' ? `/api/cameras/${cam.id}/image` : null,
        status: cam.embed === 'link' ? 'link' : img && !img.stale ? 'live' : img ? 'stale' : 'offline',
        updatedAt: img ? (img.value.lastModified ? new Date(img.value.lastModified).toISOString() : img.fetchedAt) : null,
        cloudNow: clouds?.[i] ?? null,
        frames: frames.list(cam.id).length,
      };
    });
    return c.json({ data, meta: { generatedAt: now().toISOString(), sources: [ctx.meta('open-meteo-grid', cl)] } });
  });

  app.get('/api/cameras/:id/image', async (c) => {
    const cam = camById(c.req.param('id'));
    if (!cam || cam.embed !== 'image' || !cam.imageUrl) return c.json({ error: 'not found' }, 404);
    try {
      const r = await camImage(cam);
      if (!r.stale) frames.add(cam.id, { at: r.fetchedAt, contentType: r.value.contentType, bytes: r.value.bytes });
      return new Response(r.value.bytes as unknown as BodyInit, {
        headers: { 'Content-Type': r.value.contentType, 'Cache-Control': 'public, max-age=120', 'X-Fetched-At': r.fetchedAt, 'X-Stale': String(r.stale) },
      });
    } catch {
      return c.json({ error: 'camera offline' }, 502);
    }
  });

  app.get('/api/cameras/:id/frames', (c) => c.json({ data: frames.list(c.req.param('id')) }));
  app.get('/api/cameras/:id/frames/:i', (c) => {
    const f = frames.get(c.req.param('id'), Number(c.req.param('i')));
    if (!f) return c.json({ error: 'not found' }, 404);
    return new Response(f.bytes as unknown as BodyInit, { headers: { 'Content-Type': f.contentType, 'Cache-Control': 'public, max-age=86400, immutable' } });
  });

  // ───────── Safety: warnings + roads ─────────
  app.get('/api/safety', async (c) => {
    const ll = ctx.parseLatLon((k) => c.req.query(k));
    if (!ll) return c.json({ error: 'lat and lon required' }, 400);
    const [cap, st, rc] = await Promise.allSettled([
      fetcher.get('imo-cap', UP2.cap, parseCapWarnings),
      fetcher.get('vg-weather', UP2.roadWeather, parseRoadStations),
      fetcher.get('vg-roads', UP2.roadCond, parseRoadConditions),
    ]);
    const warnings = (val(cap) ?? []).map((w) => ({ ...w, here: w.polygon ? pointInPolygon(ll, w.polygon) : null }));
    const roads = roadsNear(ll, val(st) ?? [], val(rc) ?? [], 70, 8);
    return c.json({
      data: { warnings, roads },
      meta: { generatedAt: now().toISOString(), sources: [ctx.meta('imo-cap', cap), ctx.meta('vg-weather', st), ctx.meta('vg-roads', rc)] },
    });
  });

  // ───────── Roads & warnings for the map + route corridor ─────────
  const roadData = () =>
    Promise.allSettled([fetcher.get('vg-weather', UP2.roadWeather, parseRoadStations), fetcher.get('vg-roads', UP2.roadCond, parseRoadConditions)]);

  app.get('/api/roads', async (c) => {
    const [st, rc] = await roadData();
    const stations = val(st) ?? [];
    const conds = val(rc) ?? [];
    const bySeg = new Map(conds.map((x) => [x.segmentId, x]));
    const data = stations.map((s) => {
      const cs = s.segmentIds.map((id) => bySeg.get(id)).filter((x): x is NonNullable<typeof x> => !!x);
      return { name: s.name, lat: s.lat, lon: s.lon, gustMs: s.gustMs, windMs: s.windMs, roadC: s.roadC, airC: s.airC, time: s.time, kind: classifyStation(s, cs), condition: cs.find((x) => x.severity !== 'ok')?.condition ?? cs[0]?.condition ?? null };
    });
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ data, meta: { generatedAt: now().toISOString(), sources: [ctx.meta('vg-weather', st), ctx.meta('vg-roads', rc)] } });
  });

  app.get('/api/route', async (c) => {
    const from = ctx.parseLatLon((k) => c.req.query(k === 'lat' ? 'fromLat' : 'fromLon'));
    const to = ctx.parseLatLon((k) => c.req.query(k === 'lat' ? 'toLat' : 'toLon'));
    if (!from || !to) return c.json({ error: 'fromLat, fromLon, toLat, toLon required' }, 400);
    const [st, rc] = await roadData();
    const corridor = routeCorridor(from, to, val(st) ?? [], val(rc) ?? [], 15);
    return c.json({ data: corridor, meta: { generatedAt: now().toISOString(), sources: [ctx.meta('vg-weather', st), ctx.meta('vg-roads', rc)] } });
  });

  app.get('/api/warnings', async (c) => {
    const [cap] = await Promise.allSettled([fetcher.get('imo-cap', UP2.cap, parseCapWarnings)]);
    return c.json({ data: val(cap) ?? [], meta: { generatedAt: now().toISOString(), sources: [ctx.meta('imo-cap', cap)] } });
  });

  // ───────── Shared trip plans: destination, return time, opt-in live location, check-in ─────────
  const prunePlans = () => {
    const cutoff = now().getTime() - 36 * 3.6e6;
    plans.update((all) => all.filter((p) => new Date(p.returnBy).getTime() >= cutoff));
  };
  const publicPlan = (p: TripPlan) => {
    const overdue = !p.checkedInAt && now().getTime() > new Date(p.returnBy).getTime();
    return { id: p.id, name: p.name, destination: p.destination, returnBy: p.returnBy, createdAt: p.createdAt, shareLocation: p.shareLocation, lastLocation: p.shareLocation ? p.lastLocation : null, checkedInAt: p.checkedInAt, status: p.checkedInAt ? 'safe' : overdue ? 'overdue' : 'out' };
  };
  const findPlan = (id: string) => plans.get().find((p) => p.id === id);

  app.post('/api/plans', async (c) => {
    if (!writeLimit.allow(`pl:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c, 4096);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const d = b?.destination ?? {};
    const lat = Number(d.lat);
    const lon = Number(d.lon);
    const ret = Date.parse(b?.returnBy);
    if (!isValidLatLon(lat, lon) || !Number.isFinite(ret) || ret < now().getTime() - 3.6e6 || ret > now().getTime() + 48 * 3.6e6) {
      return c.json({ error: 'destination (lat, lon) and returnBy within 48 h required' }, 400);
    }
    prunePlans();
    const p: TripPlan = {
      id: rid(9),
      secret: rid(16),
      name: typeof b.name === 'string' ? b.name.slice(0, 40) : '',
      destination: { name: typeof d.name === 'string' ? d.name.slice(0, 80) : 'Destination', lat, lon },
      returnBy: new Date(ret).toISOString(),
      createdAt: now().toISOString(),
      shareLocation: b.shareLocation === true,
      lastLocation: null,
      checkedInAt: null,
      pushEndpoint: typeof b.pushEndpoint === 'string' && b.pushEndpoint.length < 1000 ? b.pushEndpoint : null,
      overdueNotified: false,
    };
    plans.update((all) => [...all, p].slice(-5000));
    return c.json({ data: { id: p.id, secret: p.secret, plan: publicPlan(p) } }, 201);
  });

  app.get('/api/plans/:id', (c) => {
    const p = findPlan(c.req.param('id'));
    c.header('Cache-Control', 'no-store');
    return p ? c.json({ data: publicPlan(p) }) : c.json({ error: 'not found' }, 404);
  });

  const withSecret = async (c: any, fn: (p: TripPlan, b: any) => void) => {
    let b: any;
    try {
      b = await readJson(c, 1024);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const p = findPlan(c.req.param('id'));
    if (!p || b?.secret !== p.secret) return c.json({ error: 'not found' }, 404);
    fn(p, b);
    plans.set([...plans.get()]);
    return c.json({ data: publicPlan(p) });
  };

  app.post('/api/plans/:id/location', (c) => {
    if (!writeLimit.allow(`plloc:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    return withSecret(c, (p, b) => {
      if (p.shareLocation && isValidLatLon(Number(b.lat), Number(b.lon))) p.lastLocation = { lat: Number(Number(b.lat).toFixed(4)), lon: Number(Number(b.lon).toFixed(4)), at: now().toISOString() };
    });
  });
  app.post('/api/plans/:id/checkin', (c) => withSecret(c, (p) => (p.checkedInAt = now().toISOString())));
  app.post('/api/plans/:id/delete', async (c) => {
    let b: any;
    try {
      b = await readJson(c, 1024);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const p = findPlan(c.req.param('id'));
    if (!p || b?.secret !== p.secret) return c.json({ error: 'not found' }, 404);
    plans.update((all) => all.filter((x) => x.id !== p.id));
    return c.json({ data: { ok: true } });
  });

  /** Overdue plans: one "Are you back safe?" push to the owner, 15 min after their return time. */
  async function checkPlans(): Promise<number> {
    if (!ctx.sendPush) return 0;
    let n = 0;
    for (const p of plans.get()) {
      if (p.checkedInAt || p.overdueNotified || !p.pushEndpoint) continue;
      if (now().getTime() < new Date(p.returnBy).getTime() + 15 * 60_000) continue;
      const sub = subs.get().find((x) => x.endpoint === p.pushEndpoint);
      p.overdueNotified = true;
      if (!sub) continue;
      try {
        await ctx.sendPush(sub, { title: 'Are you back safe?', body: `You planned to be back from ${p.destination.name} by now. Tap to check in.`, url: `/#/plan/${p.id}?checkin=1`, tag: `plan-${p.id}` });
        n++;
      } catch {
        /* ignore */
      }
    }
    plans.set([...plans.get()]);
    return n;
  }

  // ───────── Sources & credits, feature flags ─────────
  app.get('/api/sources', (c) => {
    const byProvider = new Map<string, { provider: string; feeds: { id: string; name: string; attribution: string; homepage: string }[] }>();
    for (const s of Object.values(SOURCES) as { id: string; name: string; attribution: string; homepage: string; provider?: string }[]) {
      const p = s.provider ?? s.name;
      if (!byProvider.has(p)) byProvider.set(p, { provider: p, feeds: [] });
      byProvider.get(p)!.feeds.push({ id: s.id, name: s.name, attribution: s.attribution, homepage: s.homepage });
    }
    const providers = [...byProvider.values()].map((p) => ({ ...p, ...(PROVIDER_TERMS[p.provider] ?? {}) }));
    for (const extra of ['OpenFreeMap', 'NASA GIBS', 'NASA OMNI2 (backtest only)']) providers.push({ provider: extra, feeds: [], ...PROVIDER_TERMS[extra]! });
    const cameras = config.cameras().map((c) => ({ id: c.id, name: c.name, attribution: c.attribution, pageUrl: c.pageUrl, embed: c.embed, terms: (c as { terms?: string }).terms ?? null }));
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({ data: { providers, cameras } });
  });

  app.get('/api/features', (c) => c.json({ data: config.features() }));

  // ───────── Opt-in analytics & crash reports (privacy-friendly) ─────────
  const EVENT = /^[a-z][a-z0-9_.:-]{1,40}$/;
  app.post('/api/telemetry', async (c) => {
    if (!writeLimit.allow(`tm:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c, 4096);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const events: unknown[] = Array.isArray(b?.events) ? b.events.slice(0, 50) : [];
    const day = now().toISOString().slice(0, 10);
    telemetry.update((all) => {
      const d = { ...(all[day] ?? {}) };
      for (const e of events) if (typeof e === 'string' && EVENT.test(e)) d[e] = (d[e] ?? 0) + 1;
      const days = Object.keys({ ...all, [day]: d }).sort().slice(-90);
      return Object.fromEntries(days.map((k) => [k, k === day ? d : all[k]!]));
    });
    return c.json({ data: { ok: true } });
  });
  app.post('/api/crash', async (c) => {
    if (!writeLimit.allow(`cr:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c, 6144);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const clean = (x: unknown, n: number) => String(x ?? '').replace(/https?:\/\/[^\s)]+/g, (u) => u.split('?')[0]!).slice(0, n);
    crashes.update((all) => [...all, { at: now().toISOString().slice(0, 13) + ':00Z', message: clean(b?.message, 300), stack: clean(b?.stack, 2000), version: clean(b?.version, 20), browser: clean(b?.browser, 20) }].slice(-500));
    return c.json({ data: { ok: true } });
  });
  app.get('/api/admin/telemetry', (c) => (authed(c) ? c.json({ data: { events: telemetry.get(), crashes: crashes.get().slice(-50).reverse() } }) : c.json({ error: 'not found' }, 404)));

  // ───────── 5-night outlook ─────────
  app.get('/api/outlook', async (c) => {
    const ll = ctx.parseLatLon((k) => c.req.query(k));
    if (!ll) return c.json({ error: 'lat and lon required' }, 400);
    const minDark = c.req.query('dark') === 'astro' ? 0.95 : 0.2;
    const [cl, k27, sw] = await Promise.allSettled([
      fetcher.get('open-meteo-5day', UP2.clouds6(ll.lat, ll.lon), (raw) => parseOpenMeteo(raw).hourly, `${ll.lat},${ll.lon}`),
      fetcher.get('noaa-27day', UP2.kp27, (raw) => parse27Day(String(raw)), 'kp27', 'text'),
      ctx.spaceWeather(),
    ]);
    const hourly = val(cl);
    const sources = [ctx.meta('open-meteo-5day', cl), ctx.meta('noaa-27day', k27), ...(sw.status === 'fulfilled' ? sw.value.sources : [])];
    if (!hourly) return c.json({ error: 'cloud forecast unavailable', meta: { generatedAt: now().toISOString(), sources } }, 503);
    const nights = fiveNightOutlook({
      lat: ll.lat,
      lon: ll.lon,
      now: now(),
      hourly,
      kp3day: sw.status === 'fulfilled' ? sw.value.data.kp.series : [],
      kp27: val(k27) ?? [],
      weights: config.weights().weights,
      minDark,
    });
    c.header('Cache-Control', 'public, max-age=900');
    return c.json({ data: { location: ll, nights }, meta: { generatedAt: now().toISOString(), sources } });
  });

  // ───────── "Is it clear right now?" ─────────
  app.get('/api/clear-now', async (c) => {
    const ll = ctx.parseLatLon((k) => c.req.query(k));
    if (!ll) return c.json({ error: 'lat and lon required' }, 400);
    const [obs, st] = await Promise.allSettled([
      fetcher.get('imo-obs', UP2.ceilo, (x) => x),
      fetcher.get('imo-stations', UP2.imoStations, (x) => x),
    ]);
    const ceilo = parseCeilometer(val(obs), val(st))
      .map((o) => ({ ...o, distanceKm: Math.round(haversineKm(ll, o)) }))
      .filter((o) => o.distanceKm <= 120 && o.oktas !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const model = await ctx.clouds(ll.lat, ll.lon);
    const cams = config.cameras()
      .map((cam) => ({ id: cam.id, name: cam.name, embed: cam.embed, pageUrl: cam.pageUrl, attribution: cam.attribution, image: cam.embed === 'image' ? `/api/cameras/${cam.id}/image` : null, distanceKm: Math.round(haversineKm(ll, cam)) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return c.json({
      data: { observed: ceilo[0] ?? null, observedNearby: ceilo.slice(0, 4), model: model.data ? { effective: model.data.effective, current: model.data.current } : null, camera: cams[0] ?? null },
      meta: { generatedAt: now().toISOString(), sources: [ctx.meta('imo-obs', obs), ctx.meta('imo-stations', st), ...model.sources] },
    });
  });

  // ───────── Substorm nowcast + ground magnetometer ─────────
  async function groundMag(): Promise<{ mag: GroundMag | null; source: PromiseSettledResult<FetchResult<GroundMag>> }> {
    const t = now();
    const day = t.toISOString().slice(0, 10);
    const prev = new Date(t.getTime() - 864e5).toISOString().slice(0, 10);
    for (const station of ['NAQ', 'ABK']) {
      const [today, yday] = await Promise.allSettled([
        fetcher.get('intermagnet', UP2.gin(station, day), (raw) => parseGinMag(raw, station)),
        t.getUTCHours() < 4 ? fetcher.get('intermagnet', UP2.gin(station, prev), (raw) => parseGinMag(raw, station)) : Promise.reject(new Error('skip')),
      ]);
      const a = val(today);
      const b = val(yday);
      if (a || b) {
        const series = [...(b?.series ?? []), ...(a?.series ?? [])];
        const last = series[series.length - 1];
        // treat data older than 45 min as unusable for a "now" signal
        if (last && t.getTime() - new Date(last.time).getTime() < 45 * 60_000) return { mag: { station, name: (a ?? b)!.name, series }, source: today };
      }
      if (station === 'ABK') return { mag: null, source: today };
    }
    return { mag: null, source: { status: 'rejected', reason: new Error('no station') } };
  }

  async function nowcast() {
    const [wind, mag, kp1m, ground] = await Promise.allSettled([
      fetcher.get('noaa-rtsw-wind', UP2.rtswWind, parseRtswWind),
      fetcher.get('noaa-rtsw-mag', UP2.rtswMag, parseRtswMag),
      fetcher.get('noaa-kp-1m', UP2.kp1m, (raw) => (Array.isArray(raw) ? raw.slice(-180) : [])),
      groundMag(),
    ]);
    const w = val(wind);
    const m = val(mag);
    const g = ground.status === 'fulfilled' ? ground.value.mag : null;
    const nc = substormNowcast(m ? lastMinutes(m.series, 120) : [], w ? lastMinutes(w.series, 60) : [], g);
    const k = val(kp1m) as { time_tag: string; estimated_kp: number }[] | null;
    const groundSeries = g ? bucketAverage(g.series.filter((p) => new Date(p.time).getTime() >= new Date(g.series[g.series.length - 1]!.time).getTime() - 3 * 3.6e6), 5, ['x']) : [];
    return {
      data: {
        ...nc,
        kpEstimate: k?.length ? { time: k[k.length - 1]!.time_tag + 'Z', kp: k[k.length - 1]!.estimated_kp } : null,
        ground: g ? { station: g.station, name: g.name, latest: g.series[g.series.length - 1]!.time, series: groundSeries } : null,
      },
      sources: [ctx.meta('noaa-rtsw-wind', wind), ctx.meta('noaa-rtsw-mag', mag), ctx.meta('noaa-kp-1m', kp1m), ground.status === 'fulfilled' ? ctx.meta('intermagnet', ground.value.source) : ctx.meta('intermagnet', ground)],
    };
  }

  app.get('/api/nowcast', async (c) => {
    const r = await nowcast();
    return c.json({ data: r.data, meta: { generatedAt: now().toISOString(), sources: r.sources } });
  });

  // ───────── Community sightings: verified reports, moderation, photos, weekly feed ─────────
  const sha = (x: string) => createHash('sha256').update(x).digest('hex');
  const photoDir = ctx.dataDir ? join(ctx.dataDir, 'photos') : null;
  const memPhotos = new Map<string, Buffer>();
  const savePhoto = (id: string, buf: Buffer) => {
    if (photoDir) {
      mkdirSync(photoDir, { recursive: true });
      writeFileSync(join(photoDir, `${id}.jpg`), buf);
    } else memPhotos.set(id, buf);
  };
  const loadPhoto = (id: string): Buffer | null => {
    if (!/^[a-z0-9]{6,16}$/.test(id)) return null;
    if (!photoDir) return memPhotos.get(id) ?? null;
    try {
      return readFileSync(join(photoDir, `${id}.jpg`));
    } catch {
      return null;
    }
  };
  const deletePhoto = (id: string) => {
    if (photoDir) rmSync(join(photoDir, `${id}.jpg`), { force: true });
    else memPhotos.delete(id);
  };
  /** Live reports expire after 12 h; photos shared to the weekly feed are kept 7 days. */
  const pruneSightings = () => {
    const t = now().getTime();
    const keep = (s: Sighting) => t - Date.parse(s.at) < (s.photo && s.feed ? 7 * 864e5 : 12 * 3.6e6);
    for (const s of sightings.get()) if (!keep(s) && s.photo) deletePhoto(s.id);
    sightings.update((all) => all.filter(keep));
  };
  const visible = () => sightings.get().filter((s) => !s.hidden);
  const publicSighting = (s: Sighting, all: Sighting[]) => {
    const { ownerHash: _o, reports: _r, hidden: _h, ...pub } = s;
    return { ...pub, photoUrl: s.photo ? `/api/photos/${s.id}` : null, verification: verifySighting(s, all) };
  };

  app.get('/api/sightings', (c) => {
    pruneSightings();
    const minutes = c.req.query('minutes') ? Math.min(720, Math.max(10, Number(c.req.query('minutes')))) : null;
    const hours = Math.min(12, Math.max(1, Number(c.req.query('hours') ?? 6)));
    const cutoff = now().getTime() - (minutes ? minutes * 60_000 : hours * 3.6e6);
    const all = visible();
    c.header('Cache-Control', 'public, max-age=30');
    return c.json({ data: all.filter((s) => Date.parse(s.at) >= cutoff).map((s) => publicSighting(s, all)) });
  });

  app.post('/api/sightings', async (c) => {
    if (!writeLimit.allow(`s:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let body: any;
    try {
      body = await readJson(c, 2048);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const lat = Number(body?.lat);
    const lon = Number(body?.lon);
    const brightness = Math.round(Number(body?.brightness));
    if (!isValidLatLon(lat, lon) || !(brightness >= 1 && brightness <= 5)) return c.json({ error: 'lat, lon and brightness (1–5) required' }, 400);
    const colors = Array.isArray(body?.colors) ? body.colors.filter((x: unknown) => typeof x === 'string' && COLORS.has(x)).slice(0, 6) : [];
    const direction = typeof body?.direction === 'string' && /^(N|NE|E|SE|S|SW|W|NW|overhead)$/.test(body.direction) ? body.direction : null;
    // Reports queued offline carry their original time; accept it if it's within the last 6 h (no backdating beyond that).
    const claimed = typeof body?.at === 'string' ? Date.parse(body.at) : NaN;
    const at = Number.isFinite(claimed) && claimed <= now().getTime() + 60_000 && claimed >= now().getTime() - 6 * 3.6e6 ? new Date(claimed) : now();
    const priv = body?.private === true;
    // Signals at report time (best effort, never blocks the report for long)
    const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
    const [nc, au] = await Promise.all([withTimeout(nowcast().catch(() => null), 4000), withTimeout(ctx.aurora(snapCoord(lat), snapCoord(lon)).catch(() => null), 4000)]);
    const token = rid(16);
    const credit = typeof body?.feed?.credit === 'string' ? body.feed.credit.trim().slice(0, 40) : '';
    const s: Sighting = {
      id: rid(5),
      at: at.toISOString(),
      // privacy rounding: ~10 km by default, ~25 km for private spots; nobody's exact position is stored or shown
      lat: snapCoord(lat, priv ? 0.25 : 0.1),
      lon: snapCoord(lon, priv ? 0.25 : 0.1),
      brightness,
      colors,
      direction,
      ownerHash: sha(token),
      private: priv,
      signals: { oval: au?.data?.visible ?? null, nowcast: nc?.data.level ?? null, groundBay: nc?.data.groundBay ?? null },
      photo: false,
      feed: body?.feed && credit !== undefined && body.feed.consent === true ? { credit: credit || 'Anonymous' } : null,
      reports: [],
      hidden: false,
    };
    pruneSightings();
    sightings.update((all) => [...all, s].slice(-5000));
    return c.json({ data: { ...publicSighting(s, visible()), token } }, 201);
  });

  const owned = (id: string, token: unknown) => {
    const s = sightings.get().find((x) => x.id === id);
    return s && typeof token === 'string' && s.ownerHash === sha(token) ? s : null;
  };

  /** Attach a photo (JPEG, already resized + EXIF-stripped on the device). Owner only. */
  app.post('/api/sightings/:id/photo', async (c) => {
    if (!writeLimit.allow(`ph:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c, 650_000);
    } catch {
      return c.json({ error: 'photo too large (max ~450 KB)' }, 413);
    }
    const s = owned(c.req.param('id'), b?.token);
    if (!s) return c.json({ error: 'not found' }, 404);
    const m = typeof b?.dataUrl === 'string' ? b.dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null;
    if (!m) return c.json({ error: 'JPEG data URL required' }, 400);
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > 460_000 || buf[0] !== 0xff || buf[1] !== 0xd8) return c.json({ error: 'not a JPEG or too large' }, 400);
    savePhoto(s.id, buf);
    s.photo = true;
    sightings.set([...sightings.get()]);
    return c.json({ data: publicSighting(s, visible()) });
  });

  app.get('/api/photos/:id', (c) => {
    const s = sightings.get().find((x) => x.id === c.req.param('id'));
    const buf = s && !s.hidden && s.photo ? loadPhoto(s.id) : null;
    if (!buf) return c.json({ error: 'not found' }, 404);
    return new Response(buf as unknown as BodyInit, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
  });

  /** Owner removes their report (and photo) — "remove photos on request". */
  app.post('/api/sightings/:id/delete', async (c) => {
    let b: any;
    try {
      b = await readJson(c, 1024);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const s = owned(c.req.param('id'), b?.token);
    if (!s) return c.json({ error: 'not found' }, 404);
    if (b?.photoOnly === true) s.photo = false;
    deletePhoto(s.id);
    sightings.update((all) => (b?.photoOnly === true ? [...all] : all.filter((x) => x.id !== s.id)));
    return c.json({ data: { ok: true } });
  });

  /** Report abuse: hidden after 3 different reporters (reviewed on /admin). */
  app.post('/api/sightings/:id/report', (c) => {
    if (!writeLimit.allow(`rp:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    const s = sightings.get().find((x) => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);
    const who = sha(`${clientIp(c)}|nl`).slice(0, 16);
    s.reports = [...new Set([...(s.reports ?? []), who])];
    if (s.reports.length >= 3) s.hidden = true;
    sightings.set([...sightings.get()]);
    return c.json({ data: { ok: true } });
  });

  /** Weekly feed: opted-in photos from the last 7 days, credited, verified first. */
  app.get('/api/feed', (c) => {
    pruneSightings();
    const all = visible();
    const t = now();
    const items = all
      .filter((s) => s.photo && s.feed && t.getTime() - Date.parse(s.at) < 7 * 864e5)
      .map((s) => publicSighting(s, all))
      .map((s) => ({ ...s, rank: feedRank({ at: s.at, brightness: s.brightness, verified: s.verification.verified, featured: s.featured }, t) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 30);
    c.header('Cache-Control', 'public, max-age=300');
    return c.json({ data: items });
  });

  // Moderation (ADMIN_TOKEN): list, delete, feature
  app.get('/api/admin/sightings', (c) => (authed(c) ? c.json({ data: sightings.get().filter((s) => s.photo || (s.reports?.length ?? 0) > 0).map((s) => ({ ...publicSighting(s, sightings.get()), reports: s.reports?.length ?? 0, hidden: !!s.hidden, featured: !!s.featured })) }) : c.json({ error: 'not found' }, 404)));
  app.post('/api/admin/sightings/:id/:action', (c) => {
    if (!authed(c)) return c.json({ error: 'not found' }, 404);
    const s = sightings.get().find((x) => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);
    const a = c.req.param('action');
    if (a === 'delete') {
      deletePhoto(s.id);
      sightings.update((all) => all.filter((x) => x.id !== s.id));
    } else if (a === 'feature' || a === 'unfeature') s.featured = a === 'feature';
    else if (a === 'unhide') (s.hidden = false), (s.reports = []);
    else return c.json({ error: 'unknown action' }, 400);
    sightings.set([...sightings.get()]);
    return c.json({ data: { ok: true } });
  });

  // ───────── Score validation: outcomes ("did you see it?") ─────────
  app.post('/api/outcomes', async (c) => {
    if (!writeLimit.allow(`o:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c, 2048);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const lat = Number(b?.lat);
    const lon = Number(b?.lon);
    const night = String(b?.night ?? '');
    if (!isValidLatLon(lat, lon) || !/^\d{4}-\d{2}-\d{2}$/.test(night) || typeof b?.saw !== 'boolean') return c.json({ error: 'night, lat, lon and saw required' }, 400);
    const sl = snapCoord(lat, 0.1);
    const so = snapCoord(lon, 0.1);
    const fromLog = peakForNight(night, sl, so);
    const clientPred = Number(b?.predicted);
    const o: OutcomeEntry = {
      id: Math.random().toString(36).slice(2, 10),
      night,
      lat: sl,
      lon: so,
      saw: b.saw,
      brightness: Number.isInteger(b?.brightness) && b.brightness >= 1 && b.brightness <= 5 ? b.brightness : null,
      predicted: fromLog ?? (Number.isFinite(clientPred) && clientPred >= 0 && clientPred <= 100 ? Math.round(clientPred) : null),
      predictedFrom: fromLog != null ? 'server-log' : Number.isFinite(clientPred) ? 'client' : null,
      at: now().toISOString(),
    };
    outcomes.update((all) => [...all, o].slice(-20_000));
    return c.json({ data: o }, 201);
  });

  // ───────── Internal validation dashboard (ADMIN_TOKEN) ─────────
  function authed(c: { req: { query: (k: string) => string | undefined; header: (k: string) => string | undefined } }) {
    return !!ctx.adminToken && (c.req.query('token') === ctx.adminToken || c.req.header('authorization') === `Bearer ${ctx.adminToken}`);
  }
  function validationReport() {
    const os = outcomes.get().filter((o) => o.predicted != null);
    let backtest: unknown = null;
    if (ctx.dataDir) {
      try {
        backtest = JSON.parse(readFileSync(join(ctx.dataDir, 'backtest', 'report.json'), 'utf8'));
      } catch {
        /* not run yet */
      }
    }
    return {
      generatedAt: now().toISOString(),
      weights: config.weights(),
      scoreLog: { entries: scoreLog.get().length, since: scoreLog.get()[0]?.at ?? null },
      outcomes: { total: outcomes.get().length, withPrediction: os.length, recent: outcomes.get().slice(-30).reverse() },
      calibration: calibration(os.map((o) => ({ predicted: o.predicted!, saw: o.saw }))),
      backtest,
    };
  }
  app.get('/api/admin/validation', (c) => (authed(c) ? c.json({ data: validationReport() }) : c.json({ error: 'not found' }, 404)));
  app.get('/admin', (c) => (authed(c) ? c.html(renderAdmin(validationReport())) : c.text('Not found', 404)));

  // ───────── Web push ─────────
  app.get('/api/push/key', (c) => (ctx.vapid ? c.json({ data: { publicKey: ctx.vapid.publicKey } }) : c.json({ error: 'push not configured' }, 503)));

  app.post('/api/push/subscribe', async (c) => {
    if (!ctx.vapid) return c.json({ error: 'push not configured' }, 503);
    if (!writeLimit.allow(`p:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const endpoint = b?.subscription?.endpoint;
    const keys = b?.subscription?.keys;
    const lat = Number(b?.lat);
    const lon = Number(b?.lon);
    const p = b?.prefs ?? {};
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') {
      return c.json({ error: 'invalid subscription' }, 400);
    }
    if (!isValidLatLon(lat, lon)) return c.json({ error: 'invalid location' }, 400);
    const prefs: AlertPrefsLike = {
      minScore: Math.min(100, Math.max(10, Number(p.minScore) || 50)),
      minKp: Math.min(9, Math.max(1, Number(p.minKp) || 4)),
      bzSouth: p.bzSouth !== false,
      quietStart: HHMM.test(p.quietStart) ? p.quietStart : '02:00',
      quietEnd: HHMM.test(p.quietEnd) ? p.quietEnd : '07:00',
      tz: typeof p.tz === 'string' && p.tz.length < 64 ? p.tz : 'Atlantic/Reykjavik',
      minDark: p.minDark === 'astro' ? 0.95 : 0.6,
    };
    const sub: PushSub = {
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      lat: snapCoord(lat),
      lon: snapCoord(lon),
      label: typeof b.label === 'string' ? b.label.slice(0, 60) : 'your spot',
      prefs,
      createdAt: now().toISOString(),
      lastSent: {},
    };
    subs.update((all) => [...all.filter((x) => x.endpoint !== endpoint), sub].slice(-5000));
    return c.json({ data: { ok: true } }, 201);
  });

  app.post('/api/push/unsubscribe', async (c) => {
    let b: any;
    try {
      b = await readJson(c);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    subs.update((all) => all.filter((x) => x.endpoint !== b?.endpoint));
    return c.json({ data: { ok: true } });
  });

  app.post('/api/push/test', async (c) => {
    if (!ctx.sendPush) return c.json({ error: 'push not configured' }, 503);
    if (!writeLimit.allow(`t:${clientIp(c)}`)) return c.json({ error: 'slow down' }, 429);
    let b: any;
    try {
      b = await readJson(c);
    } catch {
      return c.json({ error: 'invalid JSON' }, 400);
    }
    const sub = subs.get().find((x) => x.endpoint === b?.endpoint);
    if (!sub) return c.json({ error: 'not subscribed' }, 404);
    await ctx.sendPush(sub, { title: 'Norðurljós alerts are on', body: `We'll tell you when the sky looks good near ${sub.label}.`, url: '/#/tonight', tag: 'test' });
    return c.json({ data: { ok: true } });
  });

  /** Evaluate alert rules for every subscriber; sends pushes. Returns number sent. */
  async function runAlerts(): Promise<number> {
    if (!ctx.sendPush) return 0;
    await checkPlans().catch(() => 0);
    const all = subs.get();
    if (!all.length) return 0;
    const t = now();
    const nc = await nowcast().catch(() => null);
    const byLoc = new Map<string, Awaited<ReturnType<typeof ctx.scoreAt>>>();
    let sent = 0;
    const gone = new Set<string>();
    for (const sub of all) {
      const key = `${sub.lat},${sub.lon}`;
      if (!byLoc.has(key)) byLoc.set(key, await ctx.scoreAt(sub.lat, sub.lon));
      const s = byLoc.get(key)!;
      const plan = planNight(t, sub.lat, sub.lon, 6, 10);
      const inDark = (iso: string) => plan.darkIntervals.some((iv) => iso >= iv.start && iso <= iv.end);
      const clearing = (s.raw.clouds?.hourly ?? []).find((h: any) => h.time > t.toISOString() && inDark(h.time) && (h.total ?? 100) <= 30);
      const next3 = (s.raw.sw?.kp.series ?? []).filter((p: any) => p.time > t.toISOString() && new Date(p.time).getTime() - t.getTime() <= 3 * 3.6e6);
      const msgs = evaluateAlerts(
        {
          score: s.data.score,
          dark: darknessFactor(sunAltitudeDeg(t, sub.lat, sub.lon)),
          cloud: s.raw.clouds?.effective ?? null,
          kpMaxNext3h: next3.length ? Math.max(...next3.map((p: any) => p.kp)) : null,
          bzAvg15: s.raw.sw?.solarWind.bzAvg15m ?? null,
          nowcast: nc?.data.level ?? 'quiet',
          clearingInHours: clearing ? (new Date(clearing.time).getTime() - t.getTime()) / 3.6e6 : null,
          placeLabel: sub.label,
        },
        sub.prefs,
        sub.lastSent,
        t,
      );
      // "Did you see it?" the next morning (09:00–11:59 local), once per night, if there was a real chance
      const localHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: sub.prefs.tz || 'UTC' }).format(t));
      const lastNight = eveningOf(new Date(t.getTime() - 14 * 3.6e6).toISOString());
      if (localHour >= 9 && localHour < 12 && sub.lastAsked !== lastNight) {
        const peak = peakForNight(lastNight, snapCoord(sub.lat, 0.1), snapCoord(sub.lon, 0.1));
        if (peak != null && peak >= 10) {
          msgs.push({ rule: 'score', title: 'Did you see aurora last night?', body: `The score near ${sub.label} reached ${peak}. One tap helps tune the forecast.`, tag: `feedback-${lastNight}` });
          sub.lastAsked = lastNight;
        }
      }
      // feature flags: advanced alert rules can be switched off (future pro tier)
      const allowed = msgs.filter((m) => (m.rule === 'score' || m.rule === 'kp-forecast' ? feature('alerts.basic') : feature('alerts.advanced')));
      for (const m of allowed) {
        try {
          const isFeedback = m.tag.startsWith('feedback-');
          const r = await ctx.sendPush(sub, { title: m.title, body: m.body, url: isFeedback ? `/#/feedback?night=${m.tag.slice(9)}` : '/#/tonight', tag: m.tag });
          if (r.gone) gone.add(sub.endpoint);
          if (!isFeedback) sub.lastSent[m.rule] = t.toISOString();
          sent++;
        } catch (e) {
          console.warn('[push] send failed', (e as Error).message);
        }
      }
    }
    subs.set(all.filter((x) => !gone.has(x.endpoint)));
    return sent;
  }

  return {
    captureFrames,
    runAlerts,
    logScore,
    flush: () => (subs.flush(), sightings.flush(), scoreLog.flush(), outcomes.flush(), plans.flush(), telemetry.flush(), crashes.flush()),
    checkPlans,
    stores: { subs, sightings, scoreLog, outcomes, plans, telemetry, crashes },
    frames,
  };
}
