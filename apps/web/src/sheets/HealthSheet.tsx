import { formatAge } from '@nordurljos/core';
import { Activity, Inbox } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCameras, useHealth } from '../lib/api';
import { onOutboxChange, outboxCount } from '../lib/outbox';
import type { Conditions } from '../lib/conditions';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const DOT = { ok: 'bg-good', stale: 'bg-fair', down: 'bg-poor', idle: 'bg-ink-3' } as const;
const STATE = { ok: 'Live', stale: 'Serving cached data', down: 'Unavailable', idle: 'Not used yet' } as const;
const ORDER = ['NOAA SWPC', 'Icelandic Met Office', 'Open-Meteo', 'MET Norway', 'Vegagerðin (road.is)', 'INTERMAGNET', 'Cameras'];

/** Data Health: every source, status dot, last update, latency, and which fallback is in use. */
export function HealthSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const q = useHealth();
  const cams = useCameras();
  const [pending, setPending] = useState(outboxCount());
  useEffect(() => {
    const off = onOutboxChange(() => setPending(outboxCount()));
    return () => void off();
  }, []);
  const h = q.data;
  const byProvider = new Map<string, NonNullable<typeof h>['sources']>();
  for (const s of h?.sources ?? []) byProvider.set(s.provider, [...(byProvider.get(s.provider) ?? []), s]);
  const providers = [...byProvider.keys()].sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);
  const down = (h?.sources ?? []).filter((s) => s.state === 'down' || s.state === 'stale').length;
  const fallback = c.clouds.data?.data.fallback;
  const imgCams = (cams.data?.data ?? []).filter((x) => x.embed === 'image');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Data health"
      initial="full"
      detents={['half', 'full']}
      header={<StatHeader id="health" icon={Activity} label="Data health" value={q.isError ? 'Server unreachable' : !h ? '…' : down ? `${down} source${down > 1 ? 's' : ''} degraded` : 'All sources healthy'} tone={q.isError || down ? 'text-fair' : 'text-good'} />}
    >
      {fallback && <p className="mb-3 rounded-[var(--r-md)] bg-[rgb(250_204_21/0.1)] p-3 text-[14px] text-fair">{fallback}. Confidence is lower until it's back.</p>}
      {pending > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] p-3 text-[14px] text-ink-2">
          <Inbox size={16} strokeWidth={1.5} aria-hidden /> {pending} report{pending > 1 ? 's' : ''} waiting to send when signal returns.
        </p>
      )}
      {q.isError && <p className="text-[15px] text-poor">Can't reach the Norðurljós server. The app is showing data saved on your phone.</p>}
      {providers.map((p) => (
        <section key={p} className="mb-4">
          <h3 className="mb-1 text-[11px] uppercase tracking-[0.22em] text-ink-3">{p}</h3>
          <ul className="divide-y divide-[rgb(255_255_255/0.06)]">
            {byProvider.get(p)!.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-2.5">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[s.state]}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-[14px]">
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-ink-3">{STATE[s.state]}</span>
                  </div>
                  <div className="text-[12px] text-ink-3">
                    {s.lastSuccessAt ? `updated ${formatAge(s.lastSuccessAt)}` : 'no data yet'} · {s.lastLatencyMs != null ? `${s.lastLatencyMs} ms` : '—'} · refreshes every {Math.round(s.expectedRefreshSec / 60)} min
                    {s.lastError && s.state !== 'ok' ? ` · ${s.lastError}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {imgCams.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-1 text-[11px] uppercase tracking-[0.22em] text-ink-3">Camera feeds</h3>
          <ul className="divide-y divide-[rgb(255_255_255/0.06)]">
            {imgCams.map((cam) => (
              <li key={cam.id} className="flex items-center gap-3 py-2.5 text-[14px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cam.status === 'live' ? 'bg-good' : cam.status === 'stale' ? 'bg-fair' : 'bg-poor'}`} aria-hidden />
                <span className="flex-1 truncate">{cam.name}</span>
                <span className="text-[12px] text-ink-3">{cam.updatedAt ? formatAge(cam.updatedAt) : cam.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="pb-8 text-[12px] leading-relaxed text-ink-3">
        Each source is retried with back-off and protected by a circuit breaker. If one fails, the app serves the last good copy (marked as cached) or switches to the backup source, and stale data is never shown as live.
      </p>
    </Sheet>
  );
}
