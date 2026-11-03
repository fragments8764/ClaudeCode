import { mapsLinks, type Gap } from '@nordurljos/core';
import { CloudSun, Navigation } from 'lucide-react';
import { hhmm } from '../lib/format';
import { isApple } from '../lib/share';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const CONF = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' } as const;
const CONF_TONE = { high: 'text-good', medium: 'text-fair', low: 'text-ink-3' } as const;

/** Cloud-gap hunter: 2–3 ranked clear-sky options with drive, leave time, window and return. */
export function GapSheet({ gaps, open, onClose, darkFrom, darkUntil }: { gaps: Gap[]; open: boolean; onClose: () => void; darkFrom: string | null; darkUntil: string | null }) {
  const maxDriveMin = useSettings((s) => s.maxDriveMin);
  return (
    <Sheet open={open} onClose={onClose} title="Cloud-gap hunter" initial="full" detents={['half', 'full']} header={<StatHeader id="gaps" icon={CloudSun} label="Cloud-gap hunter" value={gaps.length ? gaps[0]!.spot.name : 'No gaps in reach'} />}>
      <p className="text-[14px] text-ink-2">
        Darkness tonight {hhmm(darkFrom)}–{hhmm(darkUntil)}. Searching spots within {Math.floor(maxDriveMin / 60)}h{String(maxDriveMin % 60).padStart(2, '0')} drive (change in Settings → Your preferences).
      </p>
      {gaps.length === 0 && <p className="mt-4 text-[15px] text-ink-2">No clear, dark window within reach in the next 14 hours. Clouds cover everywhere you could drive to.</p>}
      <ol className="mt-4 space-y-3 pb-8">
        {gaps.map((g, i) => {
          const link = isApple() ? mapsLinks(g.spot, g.spot.name).apple : mapsLinks(g.spot, g.spot.name).google;
          return (
            <li key={g.spot.id} className={`rounded-[var(--r-lg)] p-4 ${i === 0 ? 'bg-[rgb(var(--aurora-rgb)/0.12)] shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.35)]' : 'bg-[rgb(255_255_255/0.05)]'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-display text-[22px] font-light leading-tight">{g.spot.name}</div>
                <div className={`shrink-0 text-[12px] ${CONF_TONE[g.confidence]}`}>{CONF[g.confidence]}</div>
              </div>
              <p className="mt-1 text-[15px] leading-snug">{g.summary}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <dt className="text-ink-3">Clear</dt>
                  <dd className="text-[15px] tabular-nums">{hhmm(g.clearAt)}–{hhmm(g.clearUntil)}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Cloud</dt>
                  <dd className="text-[15px] tabular-nums">{g.cloud}%</dd>
                </div>
                <div>
                  <dt className="text-ink-3">Back home</dt>
                  <dd className="text-[15px] tabular-nums">~{hhmm(g.backAt)}</dd>
                </div>
              </dl>
              <a href={link} target="_blank" rel="noreferrer" className="mt-3 block">
                <Press variant={i === 0 ? 'accent' : 'glass'} className="h-12 w-full text-[15px]" tabIndex={-1}>
                  <Navigation size={16} strokeWidth={1.75} aria-hidden /> Navigate ({g.distanceKm} km)
                </Press>
              </a>
            </li>
          );
        })}
      </ol>
      <p className="pb-8 text-[12px] text-ink-3">Cloud from Open-Meteo's grid (~50 km); confidence also looks at the surrounding area. Drive times are estimates.</p>
    </Sheet>
  );
}
