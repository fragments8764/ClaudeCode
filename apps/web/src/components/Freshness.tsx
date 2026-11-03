import { ageMinutes, formatAge } from '@nordurljos/core';
import { useNow } from '../hooks/useNow';
import { useSettings } from '../lib/store';
import { useT } from '../lib/i18n';

/** "updated 3 min ago": turns amber if older than `warnMin`, with an offline/stale hint. */
export function Freshness({ at, warnMin = 15, stale = false, label = 'updated' }: { at: string | null | undefined; warnMin?: number; stale?: boolean; label?: string }) {
  const now = useNow(30_000);
  const lang = useSettings((s) => s.language);
  const t = useT();
  const age = ageMinutes(at, now);
  const rel = (() => {
    if (lang === 'en' || age === null) return `${label} ${formatAge(at, now)}`;
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const m = Math.round(age);
    const ago = m < 60 ? rtf.format(-m, 'minute') : m < 2880 ? rtf.format(-Math.round(m / 60), 'hour') : rtf.format(-Math.round(m / 1440), 'day');
    return `${label === 'updated' ? t('updated') : label} ${ago}`;
  })();
  const old = stale || age === null || age > warnMin;
  return (
    <span className={`text-xs ${old ? 'text-fair' : 'text-ink-3'}`} title={at ?? undefined}>
      {rel}
      {stale && ' · cached'}
    </span>
  );
}
