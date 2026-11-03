import { formatAge } from '@nordurljos/core';
import { motion } from 'motion/react';
import { BadgeCheck, Flag, Images, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { spring } from '../design/tokens';
import { labelFor } from '../hooks/useGeolocation';
import { apiUrl, useFeed } from '../lib/api';
import { reportSighting } from '../lib/mySightings';
import type { SightingData } from '../lib/types';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const CONF_LABEL = { unverified: 'Unverified', low: 'Low confidence', medium: 'Verified', high: 'Verified · high confidence' } as const;
const BRIGHT = ['', 'Faint', 'Weak', 'Clear', 'Bright', 'Brilliant'];

export function VerifiedBadge({ v }: { v: SightingData['verification'] }) {
  if (!v) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${v.verified ? 'bg-[rgb(74_222_128/0.18)] text-good' : 'bg-[rgb(255_255_255/0.08)] text-ink-3'}`}>
      {v.verified && <BadgeCheck size={12} strokeWidth={2} aria-hidden />} {CONF_LABEL[v.confidence]}
    </span>
  );
}

function ReportButton({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  return (
    <button disabled={done} onClick={() => reportSighting(id).then(() => setDone(true)).catch(() => setDone(true))} className="flex min-h-[44px] items-center gap-1.5 text-[13px] text-ink-3">
      <Flag size={14} strokeWidth={1.5} aria-hidden /> {done ? 'Reported. Thank you.' : 'Report a problem'}
    </button>
  );
}

/** Tap a live dot on the map → photo, direction, brightness, verification. */
export function SightingDetailSheet({ s, open, onClose }: { s: SightingData | null; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open && !!s} onClose={onClose} title="Sighting" initial="half" detents={['half', 'full']} header={s && <StatHeader id="sighting-detail" icon={Sparkles} label={`${labelFor(s.lat, s.lon)} · ${formatAge(s.at)}`} value={`${BRIGHT[s.brightness]} aurora`} />}>
      {s && (
        <>
          {s.photoUrl && <img src={apiUrl(s.photoUrl)} alt="Aurora photo from this report" className="mb-3 w-full rounded-[var(--r-lg)] object-cover" />}
          <VerifiedBadge v={s.verification} />
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
            <div><dt className="text-ink-3">Direction</dt><dd className="text-[15px]">{s.direction ?? '—'}</dd></div>
            <div><dt className="text-ink-3">Colours</dt><dd className="text-[15px] capitalize">{s.colors.join(', ') || '—'}</dd></div>
            <div><dt className="text-ink-3">Area</dt><dd className="text-[15px]">{s.private ? '~25 km' : '~10 km'}</dd></div>
          </dl>
          {s.verification?.reasons.length ? (
            <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
              {s.verification.reasons.map((r) => <li key={r}>· {r}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-ink-3">No other signal agrees yet. Verification needs other reports nearby, magnetometer activity or the aurora oval in view.</p>
          )}
          {s.feed && <p className="mt-2 text-[12px] text-ink-3">Photo © {s.feed.credit}</p>}
          <div className="pb-6 pt-2">
            <ReportButton id={s.id} />
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Weekly feed: opted-in photos of the week, credited, verified first. */
export function FeedSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useFeed(open);
  const items = q.data?.data ?? [];
  const [sel, setSel] = useState<SightingData | null>(null);
  return (
    <>
      <Sheet open={open} onClose={onClose} title="This week's aurora" initial="full" detents={['half', 'full']} header={<StatHeader id="feed" icon={Images} label="Weekly feed" value="This week's aurora" />}>
        {q.isLoading && !items.length && <div className="skeleton h-40" />}
        {!q.isLoading && !items.length && <p className="text-[15px] text-ink-2">No photos shared this week yet. Be the first: log a sighting with a photo and opt in to the feed.</p>}
        <motion.ul className="grid grid-cols-2 gap-2 pb-4" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.05 } } }}>
          {items.map((it) => (
            <motion.li key={it.id} variants={{ h: { opacity: 0, scale: 0.97 }, s: { opacity: 1, scale: 1, transition: spring } }}>
              <button onClick={() => setSel(it)} className="block w-full overflow-hidden rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] text-left">
                <img src={apiUrl(it.photoUrl!)} alt={`Aurora near ${labelFor(it.lat, it.lon)}`} loading="lazy" className="aspect-square w-full object-cover" />
                <div className="p-2">
                  <div className="truncate text-[13px]">© {it.feed?.credit}</div>
                  <div className="flex items-center justify-between gap-1 text-[11px] text-ink-3">
                    <span className="truncate">{labelFor(it.lat, it.lon)}</span>
                    {it.verification?.verified && <BadgeCheck size={12} strokeWidth={2} className="shrink-0 text-good" aria-label="Verified" />}
                  </div>
                </div>
              </button>
            </motion.li>
          ))}
        </motion.ul>
        <p className="pb-8 text-[12px] leading-relaxed text-ink-3">Photographers keep their copyright. Shared photos are shown for 7 days and can be removed by their owner at any time; use "Report a problem" for anything that shouldn't be here.</p>
      </Sheet>
      <SightingDetailSheet s={sel} open={!!sel} onClose={() => setSel(null)} />
    </>
  );
}
