import type { ShotEntry } from '@nordurljos/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbDel } from './idb';

/** Shot log — on this device only (thumbnails in IndexedDB). */
interface Shots {
  shots: ShotEntry[];
  add: (s: Omit<ShotEntry, 'id' | 'at'>) => void;
  remove: (id: string) => void;
}
export const useShots = create<Shots>()(
  persist(
    (set, get) => ({
      shots: [],
      add: (s) => set({ shots: [{ ...s, id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString() }, ...get().shots].slice(0, 300) }),
      remove: (id) => {
        const s = get().shots.find((x) => x.id === id);
        if (s?.photoKey) idbDel(s.photoKey).catch(() => {});
        set({ shots: get().shots.filter((x) => x.id !== id) });
      },
    }),
    { name: 'nordurljos-shots', version: 1 },
  ),
);
