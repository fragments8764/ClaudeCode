import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ICELAND_PLACES } from '@nordurljos/core';

export interface UserLocation {
  lat: number;
  lon: number;
  label: string;
  source: 'gps' | 'manual' | 'default';
  /** metres, GPS only */
  accuracy?: number;
  at: string;
}

export type Tab = 'tonight' | 'map' | 'cameras' | 'space';
export type TriState = 'system' | 'on' | 'off';
export type Units = 'metric' | 'imperial';
export type Language = 'en' | 'is' | 'de' | 'fr' | 'zh' | 'ja';

export interface AlertPrefs {
  enabled: boolean;
  minDark?: 'nautical' | 'astro';
  minScore: number;
  minKp: number;
  bzSouth: boolean;
  quietStart: string; // "HH:MM"
  quietEnd: string;
}

const rvk = ICELAND_PLACES[0]!;
export const DEFAULT_LOCATION: UserLocation = {
  lat: rvk.lat,
  lon: rvk.lon,
  label: rvk.name,
  source: 'default',
  at: new Date(0).toISOString(),
};

export interface MapLayers {
  aurora: boolean;
  clouds: boolean;
  night: boolean;
  light: boolean;
  spots: boolean;
  cams: boolean;
  sightings: boolean;
  roads: boolean;
}

export interface Prefs {
  nightVision: boolean;
  reduceMotion: TriState;
  reduceTransparency: TriState;
  lowPower: boolean;
  haptics: boolean;
  sound: boolean;
  chime: boolean;
  units: Units;
  language: Language;
  alerts: AlertPrefs;
  mapLayers: MapLayers;
  /** best-spot search radius, km */
  radiusKm: number;
  favorites: string[];
  onboarded: boolean;
  /** one-tap battery saver: red-only, dimmed, static sky, slower refresh, paused camera feeds */
  batterySaver: boolean;
  /** spoken alerts while the app is open */
  spokenAlerts: boolean;
  /** switch to driving mode automatically when GPS says you're moving */
  autoDriving: boolean;
  /** personalisation (stays on this device) */
  maxDriveMin: number;
  minDarkness: 'nautical' | 'astronomical';
  hasCamera: boolean;
  favoriteSpots: string[];
  /** offline field mode: radius of the pinned region around your location */
  pinnedRadiusKm: number;
  lastPrepared: { at: string; label: string; radiusKm: number } | null;
  /** lens for photographer mode */
  lens: { focalMm: number; aperture: number; crop: number; phone: boolean };
}

interface Settings extends Prefs {
  location: UserLocation;
  tab: Tab;
  setLocation: (l: UserLocation) => void;
  setTab: (t: Tab) => void;
  set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void;
}

export const DEFAULT_PREFS: Prefs = {
  nightVision: false,
  reduceMotion: 'system',
  reduceTransparency: 'system',
  lowPower: false,
  haptics: true,
  sound: false,
  chime: false,
  units: 'metric',
  language: 'en',
  alerts: { enabled: false, minScore: 50, minKp: 4, bzSouth: true, quietStart: '02:00', quietEnd: '07:00' },
  mapLayers: { aurora: true, clouds: true, night: true, light: false, spots: true, cams: true, sightings: true, roads: true },
  radiusKm: 120,
  favorites: [],
  onboarded: false,
  batterySaver: false,
  spokenAlerts: false,
  autoDriving: true,
  maxDriveMin: 120,
  minDarkness: 'nautical',
  hasCamera: true,
  favoriteSpots: [],
  pinnedRadiusKm: 150,
  lastPrepared: null,
  lens: { focalMm: 14, aperture: 2.8, crop: 1, phone: false },
};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      location: DEFAULT_LOCATION,
      tab: 'tonight',
      setLocation: (location) => set({ location }),
      setTab: (tab) => set({ tab }),
      set: (k, v) => set({ [k]: v } as Partial<Settings>),
    }),
    {
      name: 'nordurljos-settings',
      version: 4,
      migrate: (old, version) => {
        const o = (old ?? {}) as Record<string, unknown>;
        if (version < 2) {
          // v1 had theme: 'dark' | 'red'
          const { theme, ...rest } = o;
          return { ...DEFAULT_PREFS, ...rest, nightVision: theme === 'red' } as unknown as Settings;
        }
        // v3+ added map layers, favorites, onboarding, lens, …: fill defaults (incl. new map layers)
        const merged = { ...DEFAULT_PREFS, ...o } as unknown as Settings;
        merged.mapLayers = { ...DEFAULT_PREFS.mapLayers, ...((o.mapLayers as object) ?? {}) };
        return merged;
      },
    },
  ),
);

/** Detect Chromium (supports url() filters inside backdrop-filter → refraction). */
function isChromium(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands;
  if (brands) return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
  return /Chrome\//.test(navigator.userAgent) && !/Edg|OPR|SamsungBrowser/.test(navigator.userAgent);
}

/** Sync prefs → <html> attributes consumed by tokens.css. */
export function applyPrefs(p: Pick<Prefs, 'nightVision' | 'reduceTransparency' | 'lowPower'>) {
  const el = document.documentElement;
  el.dataset.mode = p.nightVision ? 'night' : 'auto';
  if (p.reduceTransparency === 'on') el.dataset.transparency = 'reduced';
  else if (p.reduceTransparency === 'off') el.dataset.transparency = 'full';
  else delete el.dataset.transparency;
  if (p.lowPower) el.dataset.power = 'low';
  else delete el.dataset.power;
  if (isChromium()) el.dataset.refract = '';
  const bg = p.nightVision ? '#000000' : '#02040a';
  el.style.background = bg;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
}

/** Effective reduced-motion: explicit setting wins, else OS preference. */
export function useReducedMotionPref(): boolean {
  const pref = useSettings((s) => s.reduceMotion);
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
