import type { Units } from './store';

export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function temp(c: number | null | undefined, u: Units): string {
  if (c == null) return '—';
  return u === 'imperial' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`;
}

export function wind(ms: number | null | undefined, u: Units): string {
  if (ms == null) return '—';
  return u === 'imperial' ? `${Math.round(ms * 2.237)} mph` : `${Math.round(ms)} m/s`;
}

/** "in 1 h 12 min" / "now" / "for 45 min more" */
export function until(fromMs: number, toIso: string): string {
  const m = Math.round((new Date(toIso).getTime() - fromMs) / 60_000);
  if (m <= 0) return 'now';
  return duration(m);
}

/** "45 min" / "1 h 05 min", with non-breaking spaces so it never wraps mid-way. */
export function duration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}\u00a0min`;
  return `${Math.floor(m / 60)}\u00a0h\u00a0${String(m % 60).padStart(2, '0')}\u00a0min`;
}

/** "19:00" today, "tomorrow 19:00" otherwise (local calendar day). */
export function whenDay(iso: string, now: Date): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getTime() + 864e5).toDateString() === d.toDateString();
  return sameDay ? hhmm(iso) : tomorrow ? `tomorrow ${hhmm(iso)}` : d.toLocaleDateString([], { weekday: 'short' }) + ' ' + hhmm(iso);
}
