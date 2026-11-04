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
  /** Provider group for the Data Health screen. */
  provider?: string;
}

/**
 * Licences & terms per provider (Sources & credits screen). Reviewed 2026-11-03 — re-check before a
 * commercial launch; notes flag anything that needs a decision.
 */
export const PROVIDER_TERMS: Record<string, { license: string; terms: string; url: string; flag?: string }> = {
  'NOAA SWPC': { license: 'US Government work, public domain', terms: 'Free to use; please credit NOAA SWPC. Be gentle with request rates.', url: 'https://www.swpc.noaa.gov/' },
  'Open-Meteo': {
    license: 'Data CC BY 4.0',
    terms: 'Free API is non-commercial only, ~10 000 calls/day per IP. Commercial use needs a paid API key (set OPEN_METEO_API_KEY).',
    url: 'https://open-meteo.com/en/terms',
    flag: 'Needs a paid key for commercial launch; shared IPs hit the free daily limit.',
  },
  'MET Norway': { license: 'CC BY 4.0 (NLOD)', terms: 'Identify your app in the User-Agent, respect caching headers, attribute MET Norway.', url: 'https://api.met.no/doc/TermsOfService' },
  'Icelandic Met Office': { license: 'Open data, attribution to Veðurstofa Íslands', terms: 'Attribute the Icelandic Met Office; confirm terms for commercial use.', url: 'https://en.vedur.is/' },
  'Vegagerðin (road.is)': { license: 'Open data feed (gagnaveita)', terms: 'Attribute Vegagerðin. Road camera images are not offered via an open API, so we link to umferdin.is.', url: 'https://umferdin.is/' },
  INTERMAGNET: {
    license: 'INTERMAGNET conditions of use',
    terms: 'Acknowledge INTERMAGNET and the observatory institute (DTU Space for NAQ, SGU for ABK). Commercial use requires the institute’s permission.',
    url: 'https://intermagnet.org/data_conditions.html',
    flag: 'Ask DTU Space / SGU before a commercial launch.',
  },
  Cameras: { license: 'Per camera', terms: 'Each camera lists its owner and terms; images are embedded only with permission, otherwise we link to the operator.', url: '' },
  YouTube: {
    license: 'YouTube Terms of Service (embedded player)',
    terms: 'Only streams whose owners enable embedding are played, inside YouTube’s own privacy-enhanced player and only after you tap play. Each stream credits its owner.',
    url: 'https://www.youtube.com/t/terms',
  },
  OpenFreeMap: { license: '© OpenMapTiles © OpenStreetMap contributors (ODbL)', terms: 'Free, no key; attribution required. Consider a donation or self-hosting at scale.', url: 'https://openfreemap.org/' },
  'NASA GIBS': { license: 'NASA open data', terms: 'Free to use with credit to NASA EOSDIS GIBS / VIIRS.', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api' },
  'NASA OMNI2 (backtest only)': { license: 'NASA open data', terms: 'Credit NASA/GSFC Space Physics Data Facility OMNIWeb.', url: 'https://omniweb.gsfc.nasa.gov/' },
};

const MIN = 60_000;

/** Open-Meteo: free API (non-commercial, ~10k calls/day/IP) or the paid customer API when a key is set. */
const env = (k: string): string | undefined => (typeof process !== 'undefined' ? process.env?.[k] : undefined);
export const openMeteoHost = () => (env('OPEN_METEO_API_KEY') ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com');
export const openMeteoKey = () => (env('OPEN_METEO_API_KEY') ? `&apikey=${encodeURIComponent(env('OPEN_METEO_API_KEY')!)}` : '');

export const SOURCES = {
  'noaa-kp': {
    id: 'noaa-kp',
    provider: 'NOAA SWPC',
    name: 'NOAA SWPC planetary Kp',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/planetary-k-index',
    ttlMs: 5 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
  'noaa-kp-forecast': {
    id: 'noaa-kp-forecast',
    provider: 'NOAA SWPC',
    name: 'NOAA SWPC Kp forecast',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/3-day-forecast',
    ttlMs: 15 * MIN,
    staleMs: 12 * 60 * MIN,
    timeoutMs: 8000,
  },
  'noaa-rtsw-wind': {
    id: 'noaa-rtsw-wind',
    provider: 'NOAA SWPC',
    name: 'NOAA real-time solar wind (plasma)',
    attribution: 'NOAA SWPC Real-Time Solar Wind',
    homepage: 'https://www.swpc.noaa.gov/products/real-time-solar-wind',
    ttlMs: 1 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'noaa-rtsw-mag': {
    id: 'noaa-rtsw-mag',
    provider: 'NOAA SWPC',
    name: 'NOAA real-time solar wind (IMF)',
    attribution: 'NOAA SWPC Real-Time Solar Wind',
    homepage: 'https://www.swpc.noaa.gov/products/real-time-solar-wind',
    ttlMs: 1 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'noaa-ovation': {
    id: 'noaa-ovation',
    provider: 'NOAA SWPC',
    name: 'NOAA OVATION aurora forecast',
    attribution: 'NOAA SWPC OVATION Prime model',
    homepage: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast',
    ttlMs: 5 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 20000,
  },
  'open-meteo': {
    id: 'open-meteo',
    provider: 'Open-Meteo',
    name: 'Open-Meteo forecast',
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    homepage: 'https://open-meteo.com/',
    ttlMs: 10 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
  'met-norway': {
    id: 'met-norway',
    provider: 'MET Norway',
    name: 'MET Norway Locationforecast',
    attribution: 'Data from MET Norway (CC BY 4.0)',
    homepage: 'https://api.met.no/',
    ttlMs: 15 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
  'open-meteo-grid': {
    id: 'open-meteo-grid',
    provider: 'Open-Meteo',
    name: 'Open-Meteo cloud grid (Iceland & cameras)',
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    homepage: 'https://open-meteo.com/',
    ttlMs: 60 * MIN,
    staleMs: 12 * 60 * MIN,
    timeoutMs: 20000,
  },
  'noaa-kp-1m': {
    id: 'noaa-kp-1m',
    provider: 'NOAA SWPC',
    name: 'NOAA estimated Kp (1-minute)',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/planetary-k-index',
    ttlMs: 1 * MIN,
    staleMs: 60 * MIN,
    timeoutMs: 8000,
  },
  'intermagnet': {
    id: 'intermagnet',
    provider: 'INTERMAGNET',
    name: 'INTERMAGNET ground magnetometer (Narsarsuaq / Abisko)',
    attribution: 'INTERMAGNET; DTU Space (NAQ); Geological Survey of Sweden (ABK)',
    homepage: 'https://intermagnet.org/',
    ttlMs: 5 * MIN,
    staleMs: 60 * MIN,
    timeoutMs: 20000,
  },
  'imo-cap': {
    id: 'imo-cap',
    provider: 'Icelandic Met Office',
    name: 'Icelandic Met Office warnings (CAP)',
    attribution: 'Veðurstofa Íslands — Icelandic Met Office',
    homepage: 'https://en.vedur.is/',
    ttlMs: 10 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 10000,
  },
  'imo-obs': {
    id: 'imo-obs',
    provider: 'Icelandic Met Office',
    name: 'Icelandic Met Office ceilometer observations',
    attribution: 'Veðurstofa Íslands — Icelandic Met Office',
    homepage: 'https://api.vedur.is/',
    ttlMs: 5 * MIN,
    staleMs: 60 * MIN,
    timeoutMs: 10000,
  },
  'imo-stations': {
    id: 'imo-stations',
    provider: 'Icelandic Met Office',
    name: 'Icelandic Met Office station list',
    attribution: 'Veðurstofa Íslands — Icelandic Met Office',
    homepage: 'https://api.vedur.is/',
    ttlMs: 24 * 60 * MIN,
    staleMs: 7 * 24 * 60 * MIN,
    timeoutMs: 15000,
  },
  'vg-weather': {
    id: 'vg-weather',
    provider: 'Vegagerðin (road.is)',
    name: 'Vegagerðin road weather stations',
    attribution: 'Vegagerðin — Icelandic Road and Coastal Administration',
    homepage: 'https://umferdin.is/',
    ttlMs: 10 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'vg-roads': {
    id: 'vg-roads',
    provider: 'Vegagerðin (road.is)',
    name: 'Vegagerðin road conditions',
    attribution: 'Vegagerðin — Icelandic Road and Coastal Administration',
    homepage: 'https://umferdin.is/',
    ttlMs: 10 * MIN,
    staleMs: 3 * 60 * MIN,
    timeoutMs: 15000,
  },
  'camera-image': {
    id: 'camera-image',
    provider: 'Cameras',
    name: 'All-sky camera images',
    attribution: 'See each camera',
    homepage: 'https://intermagnet.org/',
    ttlMs: 3 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 20000,
  },
  'noaa-27day': {
    id: 'noaa-27day',
    provider: 'NOAA SWPC',
    name: 'NOAA 27-day outlook',
    attribution: 'NOAA Space Weather Prediction Center',
    homepage: 'https://www.swpc.noaa.gov/products/27-day-outlook-107-cm-radio-flux-and-geomagnetic-indices',
    ttlMs: 6 * 60 * MIN,
    staleMs: 48 * 60 * MIN,
    timeoutMs: 10000,
  },
  'open-meteo-5day': {
    id: 'open-meteo-5day',
    provider: 'Open-Meteo',
    name: 'Open-Meteo 6-day cloud forecast',
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    homepage: 'https://open-meteo.com/',
    ttlMs: 60 * MIN,
    staleMs: 12 * 60 * MIN,
    timeoutMs: 10000,
  },
  'open-meteo-tz': {
    id: 'open-meteo-tz',
    provider: 'Open-Meteo',
    name: 'Open-Meteo timezone lookup',
    attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    homepage: 'https://open-meteo.com/',
    ttlMs: 30 * 24 * 60 * MIN,
    staleMs: 365 * 24 * 60 * MIN,
    timeoutMs: 8000,
  },
  'youtube-oembed': {
    id: 'youtube-oembed',
    provider: 'YouTube',
    name: 'YouTube embed check (live camera streams)',
    attribution: 'Video streams via YouTube, © their owners',
    homepage: 'https://www.youtube.com/',
    ttlMs: 60 * MIN,
    staleMs: 6 * 60 * MIN,
    timeoutMs: 8000,
  },
} satisfies Record<string, SourceDef>;

export type SourceId = keyof typeof SOURCES;
