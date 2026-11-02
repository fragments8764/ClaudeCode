/** Shared domain types. Times are ISO-8601 UTC strings unless noted. */

export interface LatLon {
  lat: number;
  lon: number;
}

export type DarknessLevel = 'day' | 'civil' | 'nautical' | 'astronomical' | 'night';

export interface KpPoint {
  time: string;
  kp: number;
  kind: 'observed' | 'estimated' | 'predicted';
  /** NOAA G-scale label if present (e.g. "G1"), else null. */
  scale: string | null;
}

export interface SolarWindPoint {
  time: string;
  /** km/s */
  speed: number | null;
  /** protons per cm³ */
  density: number | null;
}

export interface ImfPoint {
  time: string;
  /** nT, total field */
  bt: number | null;
  /** nT, GSM north-south component. Negative (south) = good for aurora. */
  bz: number | null;
}

export interface CloudLayers {
  time: string;
  /** All values are percentages 0–100, or null if unavailable. */
  total: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
}

export interface CloudForecast {
  source: 'open-meteo' | 'met-norway';
  current: CloudLayers | null;
  hourly: CloudLayers[];
}
