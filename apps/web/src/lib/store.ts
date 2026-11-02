import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ICELAND_PLACES } from '@nordurljos/core';

export type Theme = 'dark' | 'red';

export interface UserLocation {
  lat: number;
  lon: number;
  label: string;
  source: 'gps' | 'manual' | 'default';
  /** metres, GPS only */
  accuracy?: number;
  at: string;
}

const rvk = ICELAND_PLACES[0]!;
export const DEFAULT_LOCATION: UserLocation = {
  lat: rvk.lat,
  lon: rvk.lon,
  label: rvk.name,
  source: 'default',
  at: new Date(0).toISOString(),
};

interface Settings {
  theme: Theme;
  location: UserLocation;
  setTheme: (t: Theme) => void;
  setLocation: (l: UserLocation) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'dark',
      location: DEFAULT_LOCATION,
      setTheme: (theme) => set({ theme }),
      setLocation: (location) => set({ location }),
    }),
    { name: 'nordurljos-settings', version: 1 },
  ),
);

/** Keep <html data-theme> and the browser chrome colour in sync with the store. */
export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  const bg = theme === 'red' ? '#000000' : '#05070d';
  el.style.background = bg;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', bg);
}
