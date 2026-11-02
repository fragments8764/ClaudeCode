/**
 * Upstream source registry. Every external dependency is declared here with its
 * cache policy and attribution, so the health page and credits stay in sync.
 * Endpoints verified 2026-11-02 — see README "Data sources".
 */
export interface SourceDef {
  id: string;
  name: string;
  /** Credit line shown in the UI. */
  attribution: string;
  homepage: string;
  /** Fresh for this long. */
  ttlMs: number;
  /** After TTL, keep serving the last good value for this long if upstream fails. */
  staleMs: number;
  timeoutMs: number;
}

const MIN = 60_000;

export const SOURCES = {
  'noaa-kp': {
    id: 'noaa-kp',
    name: 'NOAA SWPC planetary Kp',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/planetary-k-index',
    ttlMs: 5 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
  'noaa-kp-forecast': {
    id: 'noaa-kp-forecast',
    name: 'NOAA SWPC Kp forecast',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/3-day-forecast',
    ttlMs: 15 * MIN,
    staleMs: 12 * 60 * MIN,
    timeoutMs: 8000,
  },
  'noaa-rtsw-wind': {
    id: 'noaa-rtsw-wind',
    name: 'NOAA real-time solar wind (plasma)',
    attribution: 'NOAA SWPC Real-Time Solar Wind',
    homepage: 'https://www.swpc.noaa.gov/products/real-time-solar-wind',
    ttlMs: 1 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'noaa-rtsw-mag': {
    id: 'noaa-rtsw-mag',
    name: 'NOAA real-time solar wind (IMF)',
    attribution: 'NOAA SWPC Real-Time Solar Wind',
    homepage: 'https://www.swpc.noaa.gov/products/real-time-solar-wind',
    ttlMs: 1 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'open-meteo': {
    id: 'open-meteo',
    name: 'Open-Meteo forecast',
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    homepage: 'https://open-meteo.com/',
    ttlMs: 10 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
  'met-norway': {
    id: 'met-norway',
    name: 'MET Norway Locationforecast',
    attribution: 'Data from MET Norway (CC BY 4.0)',
    homepage: 'https://api.met.no/',
    ttlMs: 15 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
} satisfies Record<string, SourceDef>;

export type SourceId = keyof typeof SOURCES;
