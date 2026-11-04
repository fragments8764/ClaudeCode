import type { Units } from './store';

/**
 * Times are shown in the *location's* timezone (like Apple Weather), not the phone's: a
 * traveller planning Iceland from New York must see Reykjavík's moonset as 16:09, not 11:09.
 * Set from /api/timezone when the location changes; undefined = the phone's own zone.
 */
let displayTz: string | undefined;
export function setDisplayTimeZone(tz: string | null | undefined) {
  try {
    // validate: an unknown zone would make every toLocale* call throw
    if (tz) new Intl.DateTimeFormat('en', { timeZone: tz }).format(0);
    displayTz = tz || undefined;
  } catch {
    displayTz = undefined;
  }
}
export const displayTimeZone = () => displayTz;
/** True when the location's zone differs from the phone's (so the UI can say so). */
export function timeZoneDiffers(now = new Date()): boolean {
  if (!displayTz) return false;
  const f = (tz?: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return f(displayTz) !== f(undefined);
}

export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: displayTz });
}

/** Calendar date (YYYY-MM-DD) of an instant in the display zone. */
export function localDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: displayTz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Date label in the display zone, e.g. dateLabel(d, { weekday: 'long' }). */
export function dateLabel(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString([], { ...opts, timeZone: displayTz });
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
  const sameDay = localDay(d) === localDay(now);
  const tomorrow = localDay(new Date(now.getTime() + 864e5)) === localDay(d);
  return sameDay ? hhmm(iso) : tomorrow ? `tomorrow ${hhmm(iso)}` : dateLabel(d, { weekday: 'short' }) + ' ' + hhmm(iso);
}
