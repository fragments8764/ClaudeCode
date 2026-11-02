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
  }[];
}
