import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Personal aurora journal — stored only on this device. */
export interface JournalEntry {
  id: string;
  at: string;
  place: string;
  lat: number;
  lon: number;
  saw: boolean;
  brightness: number | null; // 1–5
  colors: string[];
  score: number | null;
  kp: number | null;
  cloud: number | null;
  notes: string;
}

interface Journal {
  entries: JournalEntry[];
  add: (e: Omit<JournalEntry, 'id' | 'at'> & { at?: string }) => JournalEntry;
  remove: (id: string) => void;
}

export const useJournal = create<Journal>()(
  persist(
    (set) => ({
      entries: [],
      add: (e) => {
        const entry: JournalEntry = { ...e, id: Math.random().toString(36).slice(2, 10), at: e.at ?? new Date().toISOString() };
        set((s) => ({ entries: [entry, ...s.entries].slice(0, 500) }));
        return entry;
      },
      remove: (id) => set((s) => ({ entries: s.entries.filter((x) => x.id !== id) })),
    }),
    { name: 'nordurljos-journal', version: 1 },
  ),
);

/** Nights are counted by local evening: anything before noon belongs to the previous night. */
export function nightKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 12 * 3.6e6);
  return d.toISOString().slice(0, 10);
}

export interface Stats {
  nightsOut: number;
  nightsSeen: number;
  bestKp: number | null;
  colors: string[];
  bestScore: number | null;
}

export function stats(entries: JournalEntry[]): Stats {
  const out = new Set(entries.map((e) => nightKey(e.at)));
  const seen = new Set(entries.filter((e) => e.saw).map((e) => nightKey(e.at)));
  const kps = entries.filter((e) => e.saw && e.kp != null).map((e) => e.kp!);
  const scores = entries.filter((e) => e.score != null).map((e) => e.score!);
  return {
    nightsOut: out.size,
    nightsSeen: seen.size,
    bestKp: kps.length ? Math.max(...kps) : null,
    colors: [...new Set(entries.filter((e) => e.saw).flatMap((e) => e.colors))],
    bestScore: scores.length ? Math.max(...scores) : null,
  };
}

export interface Badge {
  id: string;
  name: string;
  hint: string;
  earned: boolean;
}

/** Light gamification — never pushy, purely for fun. */
export function badges(entries: JournalEntry[]): Badge[] {
  const s = stats(entries);
  const late = entries.some((e) => {
    const h = new Date(e.at).getHours();
    return h >= 1 && h < 5;
  });
  return [
    { id: 'first', name: 'First light', hint: 'See your first aurora', earned: s.nightsSeen >= 1 },
    { id: 'five', name: 'Five nights out', hint: 'Go out on 5 different nights', earned: s.nightsOut >= 5 },
    { id: 'colors', name: 'Full palette', hint: 'See 3 different colours', earned: s.colors.length >= 3 },
    { id: 'red', name: 'Red aurora', hint: 'Spot rare high-altitude red', earned: s.colors.includes('red') },
    { id: 'storm', name: 'Storm chaser', hint: 'See aurora at Kp 6 or more', earned: (s.bestKp ?? 0) >= 6 },
    { id: 'owl', name: 'Night owl', hint: 'Log a sighting between 01:00 and 05:00', earned: late },
  ];
}
