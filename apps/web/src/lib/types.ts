import type { CloudLayers, ImfPoint, KpPoint, SolarWindPoint } from '@nordurljos/core';

export interface SourceMeta {
  id: string;
  name: string;
  attribution: string;
  homepage: string;
  ok: boolean;
  stale: boolean;
  fetchedAt: string | null;
  error?: string;
  provider?: string;
  ttlSec?: number;
}

export interface Envelope<T> {
  data: T;
  meta: { generatedAt: string; sources: SourceMeta[] };
}

export interface SpaceWeather {
  kp: {
    now: KpPoint | null;
    gScaleNow: number | null;
    max24h: KpPoint | null;
    gScaleMax24h: number | null;
    series: KpPoint[];
  };
  solarWind: {
    spacecraft: string | null;
    latest: (Partial<SolarWindPoint> & Partial<ImfPoint> & { time: string }) | null;
    windTime: string | null;
    magTime: string | null;
    bzAvg15m: number | null;
    wind6h: SolarWindPoint[];
    mag6h: ImfPoint[];
  };
}

export interface Clouds {
  location: { lat: number; lon: number };
  current: CloudLayers | null;
  effective: number | null;
  confidence: 'high' | 'medium' | 'low' | 'single-source' | 'none';
  spread: number | null;
  perSource: { source: string; current: CloudLayers | null }[];
  hourly: CloudLayers[];
  weather: { temperature: number | null; feelsLike: number | null; windSpeed: number | null; windGust: number | null } | null;
  fallback?: string | null;
  /** a nearby ceilometer settled a disagreement between the models */
  observed?: { name: string; distanceKm: number; time: string; percent: number; picked: string } | null;
  crossCheck?: string | null;
}

export interface Health {
  status: 'ok' | 'degraded';
  startedAt: string;
  now: string;
  cacheEntries: number;
  sources: {
    id: string;
    name: string;
    attribution: string;
    homepage: string;
    ttlSeconds: number;
    breaker: 'closed' | 'open' | 'half-open';
    consecutiveFailures: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
    lastLatencyMs: number | null;
    requests: number;
    cacheHits: number;
    provider: string;
    expectedRefreshSec: number;
    ageSec: number | null;
    state: 'ok' | 'stale' | 'down' | 'idle';
  }[];
}

export interface AuroraAt {
  location: { lat: number; lon: number };
  overhead: number;
  visible: number;
  peakLat: number;
  peakLon: number;
  forecastTime: string | null;
}

export interface OvationGridData {
  latMin: number;
  latMax: number;
  values: number[];
  forecastTime: string | null;
  observationTime: string | null;
}

export interface Camera {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  kind: string;
  embed: 'image' | 'link' | 'video';
  image: string | null;
  /** embed: 'video' — stream allowed to be embedded (checked by the server) */
  video?: { provider: 'youtube'; id: string };
  /** proxied still for video streams */
  poster?: string | null;
  pageUrl: string;
  attribution: string;
  note?: string;
  status: 'live' | 'stale' | 'offline' | 'link';
  updatedAt: string | null;
  cloudNow: number | null;
  frames: number;
}

export interface SafetyData {
  warnings: { id: string; headline: string; description: string; event: string; severity: string; onset: string | null; expires: string | null; area: string; here: boolean | null; polygon?: [number, number][] | null }[];
  roads: {
    station: { id: number; name: string; lat: number; lon: number; time: string | null; windMs: number | null; gustMs: number | null; airC: number | null; roadC: number | null };
    distanceKm: number;
    conditions: { name: string; condition: string; severity: 'ok' | 'caution' | 'closed' | 'unknown'; updated: string | null }[];
  }[];
}

export interface ClearNow {
  observed: { name: string; oktas: number | null; baseM: number | null; time: string; distanceKm: number } | null;
  model: { effective: number | null } | null;
  camera: { id: string; name: string; embed: 'image' | 'link'; image: string | null; pageUrl: string; attribution: string; distanceKm: number } | null;
}

export interface NowcastData {
  level: 'quiet' | 'loading' | 'likely' | 'onset';
  headline: string;
  detail: string;
  southMinutes: number;
  bzAvg30: number | null;
  groundBay: number | null;
  kpEstimate: { time: string; kp: number } | null;
  ground: { station: string; name: string; latest: string; series: { time: string; x: number }[] } | null;
}

export interface SightingData {
  id: string;
  at: string;
  lat: number;
  lon: number;
  brightness: number;
  colors: string[];
  direction: string | null;
  private?: boolean;
  photoUrl?: string | null;
  feed?: { credit: string } | null;
  featured?: boolean;
  verification?: { confidence: 'unverified' | 'low' | 'medium' | 'high'; verified: boolean; nearbyReports: number; reasons: string[] };
}
