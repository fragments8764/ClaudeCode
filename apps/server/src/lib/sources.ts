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
  'noaa-ovation': {
    id: 'noaa-ovation',
    name: 'NOAA OVATION aurora forecast',
    attribution: 'NOAA SWPC OVATION Prime model',
    homepage: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast',
    ttlMs: 5 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 20000,
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
  'open-meteo-grid': {
    id: 'open-meteo-grid',
    name: 'Open-Meteo cloud grid (Iceland & cameras)',
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    homepage: 'https://open-meteo.com/',
    ttlMs: 60 * MIN,
    staleMs: 12 * 60 * MIN,
    timeoutMs: 20000,
  },
  'noaa-kp-1m': {
    id: 'noaa-kp-1m',
    name: 'NOAA estimated Kp (1-minute)',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/planetary-k-index',
    ttlMs: 1 * MIN,
    staleMs: 60 * MIN,
    timeoutMs: 8000,
  },
  'intermagnet': {
    id: 'intermagnet',
    name: 'INTERMAGNET ground magnetometer (Narsarsuaq / Abisko)',
    attribution: 'INTERMAGNET; DTU Space (NAQ); Geological Survey of Sweden (ABK)',
    homepage: 'https://intermagnet.org/',
    ttlMs: 5 * MIN,
    staleMs: 60 * MIN,
    timeoutMs: 20000,
  },
  'imo-cap': {
    id: 'imo-cap',
    name: 'Icelandic Met Office warnings (CAP)',
    attribution: 'Veðurstofa Íslands — Icelandic Met Office',
    homepage: 'https://en.vedur.is/',
    ttlMs: 10 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 10000,
  },
  'imo-obs': {
    id: 'imo-obs',
    name: 'Icelandic Met Office ceilometer observations',
    attribution: 'Veðurstofa Íslands — Icelandic Met Office',
    homepage: 'https://api.vedur.is/',
    ttlMs: 5 * MIN,
    staleMs: 60 * MIN,
    timeoutMs: 10000,
  },
  'imo-stations': {
    id: 'imo-stations',
    name: 'Icelandic Met Office station list',
    attribution: 'Veðurstofa Íslands — Icelandic Met Office',
    homepage: 'https://api.vedur.is/',
    ttlMs: 24 * 60 * MIN,
    staleMs: 7 * 24 * 60 * MIN,
    timeoutMs: 15000,
  },
  'vg-weather': {
    id: 'vg-weather',
    name: 'Vegagerðin road weather stations',
    attribution: 'Vegagerðin — Icelandic Road and Coastal Administration',
    homepage: 'https://umferdin.is/',
    ttlMs: 10 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'vg-roads': {
    id: 'vg-roads',
    name: 'Vegagerðin road conditions',
    attribution: 'Vegagerðin — Icelandic Road and Coastal Administration',
    homepage: 'https://umferdin.is/',
    ttlMs: 10 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'camera-image': {
    id: 'camera-image',
    name: 'All-sky camera images',
    attribution: 'See each camera',
    homepage: 'https://intermagnet.org/',
    ttlMs: 3 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 20000,
  },
} satisfies Record<string, SourceDef>;

export type SourceId = keyof typeof SOURCES;
