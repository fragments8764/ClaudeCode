import { Check, Clock, MapPin, Phone, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatAge } from '@nordurljos/core';
import { hhmm } from '../lib/format';
import { activePlan, checkIn, fetchPlan, type PublicPlan } from '../lib/plan';
import { Press } from '../ui/Button';
import { Glass } from '../ui/Glass';

/** Public plan page (#/plan/<id>) for the friend the plan was shared with. */
export function PlanViewer({ id, wantCheckin }: { id: string; wantCheckin: boolean }) {
  const [p, setP] = useState<PublicPlan | null>(null);
  const [err, setErr] = useState(false);
  const mine = activePlan()?.id === id;
  useEffect(() => {
    const load = () => fetchPlan(id).then(setP).catch(() => setErr(true));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [id]);
  const tone = p?.status === 'safe' ? 'text-good' : p?.status === 'overdue' ? 'text-poor' : 'text-ink';
  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <Glass radius="xl" className="w-full max-w-md p-6">
        {err ? (
          <p className="text-[16px] text-ink-2">This plan has expired or doesn't exist.</p>
        ) : !p ? (
          <div className="skeleton h-40" />
        ) : (
          <>
            <div className="text-[11px] uppercase tracking-[0.22em] text-ink-3">Aurora trip plan</div>
            <h1 className={`mt-1 font-display text-[30px] font-light leading-tight ${tone}`}>
              {p.status === 'safe' ? `${p.name || 'They'} checked in safe` : p.status === 'overdue' ? `${p.name || 'They'} haven't checked in yet` : `${p.name || 'Someone'} is out aurora hunting`}
            </h1>
            <ul className="mt-4 space-y-3 text-[15px]">
              <li className="flex gap-3">
                <MapPin size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span>
                  {p.destination.name}{' '}
                  <a className="text-[rgb(var(--aurora-rgb))] underline" href={`https://maps.google.com/?q=${p.destination.lat},${p.destination.lon}`} target="_blank" rel="noreferrer">
                    map
                  </a>
                </span>
              </li>
              <li className="flex gap-3">
                <Clock size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                <span>Planned return {hhmm(p.returnBy)} {p.checkedInAt ? `· checked in ${hhmm(p.checkedInAt)}` : ''}</span>
              </li>
              {p.lastLocation && (
                <li className="flex gap-3">
                  <MapPin size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    Last location {formatAge(p.lastLocation.at)}:{' '}
                    <a className="text-[rgb(var(--aurora-rgb))] underline" href={`https://maps.google.com/?q=${p.lastLocation.lat},${p.lastLocation.lon}`} target="_blank" rel="noreferrer">
                      open in Maps
                    </a>
                  </span>
                </li>
              )}
            </ul>
            {p.status === 'overdue' && (
              <p className="mt-4 flex gap-2 rounded-[var(--r-md)] bg-[rgb(251_113_133/0.12)] p-3 text-[14px] text-ink-2">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-poor" aria-hidden />
                Try calling them first. If you can't reach them and you're worried, call Iceland's emergency number 112 and share this page.
              </p>
            )}
            {mine && p.status !== 'safe' && (
              <Press variant="accent" className="mt-5 h-14 w-full text-[16px]" onClick={() => checkIn().then(() => fetchPlan(id).then(setP))} autoFocus={wantCheckin}>
                <Check size={18} strokeWidth={2} aria-hidden /> I'm back safe
              </Press>
            )}
            <a href="tel:112" className="mt-3 block">
              <Press className="h-12 w-full text-[14px]" tabIndex={-1}>
                <Phone size={15} strokeWidth={1.75} aria-hidden /> Emergency 112
              </Press>
            </a>
            <p className="mt-4 text-[12px] text-ink-3">Shared from Norðurljós. This page and any location are deleted 36 h after the planned return.</p>
          </>
        )}
      </Glass>
    </div>
  );
}
