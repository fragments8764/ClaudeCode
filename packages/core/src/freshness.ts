/** Human-friendly data age, e.g. "just now", "4 min ago", "2 h ago". */
export function formatAge(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'unknown';
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function ageMinutes(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  return Number.isFinite(ms) ? ms / 60_000 : null;
}
