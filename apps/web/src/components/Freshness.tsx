import { ageMinutes, formatAge } from '@nordurljos/core';
import { useNow } from '../hooks/useNow';

/** "updated 3 min ago": turns amber if older than `warnMin`, with an offline/stale hint. */
export function Freshness({ at, warnMin = 15, stale = false, label = 'updated' }: { at: string | null | undefined; warnMin?: number; stale?: boolean; label?: string }) {
  const now = useNow(30_000);
  const age = ageMinutes(at, now);
  const old = stale || age === null || age > warnMin;
  return (
    <span className={`text-xs ${old ? 'text-ok' : 'text-muted'}`} title={at ?? undefined}>
      {label} {formatAge(at, now)}
      {stale && ' · cached'}
    </span>
  );
}
