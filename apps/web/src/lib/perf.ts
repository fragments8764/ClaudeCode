import { useSyncExternalStore } from 'react';
import { useSettings } from './store';

/**
 * Field performance monitor.
 *  - Real frame rate from requestAnimationFrame, in 5-second windows, per screen (tab).
 *  - Battery level over time (Battery Status API: Chrome/Android; iOS Safari has none, so the
 *    Field test screen asks you to type the % instead).
 *  - Errors and long tasks.
 *  - Auto Low power: if the app can't hold 40 fps for two windows in a row while visible
 *    (after a 10 s settle), it switches Low power on and says so in Settings.
 */
export interface FpsWindow {
  at: number;
  fps: number;
  screen: string;
}
export interface BatterySample {
  at: number;
  level: number; // 0–1
  charging: boolean;
}
export interface PerfState {
  startedAt: number;
  windows: FpsWindow[];
  battery: BatterySample[];
  batterySupported: boolean | null;
  errors: { at: number; message: string }[];
  longTasks: number;
  longTaskMs: number;
  autoLowPowerAt: number | null;
}

const WINDOW_MS = 5000;
const SETTLE_MS = 10_000;
export const FPS_FLOOR = 40;

let state: PerfState = { startedAt: Date.now(), windows: [], battery: [], batterySupported: null, errors: [], longTasks: 0, longTaskMs: 0, autoLowPowerAt: null };
const subs = new Set<() => void>();
const emit = () => {
  state = { ...state };
  subs.forEach((f) => f());
};
export const getPerf = () => state;
export function usePerf(): PerfState {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => state,
    () => state,
  );
}
export function resetPerf() {
  state = { ...state, startedAt: Date.now(), windows: [], battery: state.battery.slice(-1), errors: [], longTasks: 0, longTaskMs: 0 };
  emit();
}

/** Pure rule, exported for tests: two consecutive windows under the floor → degrade. */
export function shouldAutoLowPower(windows: FpsWindow[], floor = FPS_FLOOR): boolean {
  const n = windows.length;
  return n >= 2 && windows[n - 1]!.fps < floor && windows[n - 2]!.fps < floor;
}

/** Summary per screen: average and worst window. */
export function fpsByScreen(windows: FpsWindow[]) {
  const by = new Map<string, number[]>();
  for (const w of windows) by.set(w.screen, [...(by.get(w.screen) ?? []), w.fps]);
  return [...by.entries()].map(([screen, v]) => ({ screen, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), worst: Math.round(Math.min(...v)), windows: v.length }));
}

/** Battery drain in %-points per 10 minutes over the non-charging samples, or null. */
export function drainPer10Min(samples: BatterySample[]): number | null {
  const s = samples.filter((b) => !b.charging);
  if (s.length < 2) return null;
  const a = s[0]!;
  const b = s[s.length - 1]!;
  const mins = (b.at - a.at) / 60_000;
  if (mins < 2) return null;
  return Math.round(((a.level - b.level) * 100 * 10 * 10) / mins) / 10;
}

let suppressed = false;
/** The user turned Low power back off: don't flip it on again this session. */
export function suppressAutoLowPower() {
  suppressed = true;
}

let started = false;
export function startPerfMonitor() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let frames = 0;
  let winStart = performance.now();
  let settleUntil = performance.now() + SETTLE_MS;
  const screen = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'tonight');
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    frames++;
    if (now - winStart >= WINDOW_MS) {
      const fps = (frames * 1000) / (now - winStart);
      frames = 0;
      winStart = now;
      if (now < settleUntil) return;
      state.windows = [...state.windows, { at: Date.now(), fps: Math.round(fps * 10) / 10, screen: screen() }].slice(-720); // 1 h
      const prefs = useSettings.getState();
      if (!suppressed && !prefs.lowPower && !prefs.batterySaver && shouldAutoLowPower(state.windows)) {
        prefs.set('lowPower', true);
        prefs.set('autoLowPower', true);
        state.autoLowPowerAt = Date.now();
      }
      emit();
    }
  };
  requestAnimationFrame(loop);
  // a tab switch or wake-up stutters briefly: don't count it
  document.addEventListener('visibilitychange', () => {
    frames = 0;
    winStart = performance.now();
    settleUntil = performance.now() + SETTLE_MS;
  });
  addEventListener('hashchange', () => (settleUntil = Math.max(settleUntil, performance.now() + 2000)));

  addEventListener('error', (e) => {
    state.errors = [...state.errors, { at: Date.now(), message: String(e.message || e.error).slice(0, 200) }].slice(-20);
    emit();
  });
  addEventListener('unhandledrejection', (e) => {
    state.errors = [...state.errors, { at: Date.now(), message: `Unhandled: ${String((e as PromiseRejectionEvent).reason).slice(0, 180)}` }].slice(-20);
    emit();
  });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        state.longTasks++;
        state.longTaskMs += e.duration;
      }
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    /* Safari: no Long Tasks API */
  }

  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }> };
  if (!nav.getBattery) {
    state.batterySupported = false;
    emit();
    return;
  }
  nav
    .getBattery()
    .then((b) => {
      state.batterySupported = true;
      const sample = () => {
        state.battery = [...state.battery, { at: Date.now(), level: b.level, charging: b.charging }].slice(-240);
        emit();
      };
      sample();
      setInterval(sample, 60_000);
      b.addEventListener('levelchange', sample);
      b.addEventListener('chargingchange', sample);
    })
    .catch(() => {
      state.batterySupported = false;
      emit();
    });
}
