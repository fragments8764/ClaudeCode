/** Parsing helpers. Upstream feeds are untrusted: never assume shape. */

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise upstream timestamps to ISO-8601 UTC.
 * Accepts "2026-11-02T21:00:00", "2026-11-02 21:00:00.000", "...Z", "2026-11-02T21:15" (Open-Meteo GMT).
 * Timestamps without an offset are treated as UTC (all our sources publish UTC).
 */
export function isoUtc(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 10) return null;
  let s = v.trim().replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export class ParseError extends Error {
  constructor(source: string, detail: string) {
    super(`${source}: ${detail}`);
    this.name = 'ParseError';
  }
}
