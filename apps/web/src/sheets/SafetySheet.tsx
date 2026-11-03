import { formatAge } from '@nordurljos/core';
import { BatteryCharging, Phone, Share2, ShieldAlert, Snowflake, TriangleAlert, Wind } from 'lucide-react';
import { useState } from 'react';
import type { Conditions } from '../lib/conditions';
import { useSafety } from '../lib/api';
import { hhmm, temp, wind } from '../lib/format';
import { shareText } from '../lib/share';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { TIPS } from '../lib/tips';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const SEV = { ok: 'text-good', caution: 'text-fair', closed: 'text-poor', unknown: 'text-ink-3' } as const;

export function useSafetySummary() {
  const location = useSettings((s) => s.location);
  const q = useSafety(location.lat, location.lon);
  const d = q.data?.data;
  const warnings = (d?.warnings ?? []).filter((w) => w.here !== false);
  const gust = Math.max(0, ...(d?.roads ?? []).slice(0, 3).map((r) => r.station.gustMs ?? 0));
  const closed = (d?.roads ?? []).flatMap((r) => r.conditions).filter((c) => c.severity === 'closed').length;
  return { q, d, warnings, gust, closed, alert: warnings.length > 0 || gust >= 20 || closed > 0 };
}

/** Safety layer: IMO warnings, nearby road conditions & wind, emergency links, plan sharing, cold tips. */
export function SafetySheet({ c, open, onClose, onPlan }: { c: Conditions; open: boolean; onClose: () => void; onPlan?: () => void }) {
  const { location, units } = useSettings();
  const { q, d, warnings, gust } = useSafetySummary();
  const [shared, setShared] = useState('');
  const w = c.clouds.data?.data.weather;
  const value = warnings.length ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : gust >= 20 ? 'Strong gusts' : 'No warnings';

  const plan = async () => {
    const back = c.best ? hhmm(new Date(new Date(c.best.end).getTime() + 45 * 60_000).toISOString()) : null;
    const r = await shareText(
      'My aurora plan',
      `I'm out aurora hunting near ${location.label}${c.best ? ` between ${hhmm(c.best.start)} and ${hhmm(c.best.end)}` : ' tonight'}.` +
        (back ? ` I expect to be back around ${back}.` : '') +
        ` Location: https://maps.google.com/?q=${location.lat.toFixed(4)},${location.lon.toFixed(4)} · Emergency in Iceland: 112.`,
    );
    setShared(r === 'copied' ? 'Plan copied, so paste it to a friend.' : r === 'shared' ? 'Plan shared.' : '');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Safety" initial="full" detents={['half', 'full']} header={<StatHeader id="safety" icon={ShieldAlert} label="Safety & roads" value={value} tone={warnings.length || gust >= 20 ? 'text-fair' : 'text-good'} />}>
      {warnings.map((wn) => (
        <div key={wn.id} className="mb-3 rounded-[var(--r-md)] bg-[rgb(250_204_21/0.1)] p-4 shadow-[inset_0_0_0_1px_rgb(250_204_21/0.35)]">
          <div className="flex items-center gap-2 text-[15px] font-medium text-fair">
            <TriangleAlert size={16} strokeWidth={1.75} aria-hidden /> {wn.headline}
          </div>
          {wn.description && <p className="mt-1 text-[14px] leading-snug text-ink-2">{wn.description}</p>}
          <p className="mt-1 text-[12px] text-ink-3">
            {wn.onset ? `From ${hhmm(wn.onset)}` : ''} {wn.expires ? `until ${hhmm(wn.expires)}` : ''} · {wn.area} · Icelandic Met Office
          </p>
        </div>
      ))}
      {!warnings.length && <p className="text-[15px] text-ink-2">No active Icelandic Met Office warnings for your area.</p>}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Mini icon={Wind} k="Wind" v={wind(w?.windSpeed, units)} />
        <Mini icon={Wind} k="Gusts" v={wind(w?.windGust, units)} tone={(w?.windGust ?? 0) >= 20 ? 'text-fair' : undefined} />
        <Mini icon={Snowflake} k="Feels" v={temp(w?.feelsLike, units)} />
      </div>

      <h3 className="mb-1 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Roads near you</h3>
      {q.isLoading && !d && <div className="skeleton h-24" />}
      <ul className="divide-y divide-[rgb(255_255_255/0.06)]">
        {(d?.roads ?? []).slice(0, 6).map((r) => (
          <li key={r.station.id} className="py-2.5">
            <div className="flex justify-between gap-2 text-[14px]">
              <span className="truncate font-medium">{r.station.name}</span>
              <span className="shrink-0 text-ink-3">{r.distanceKm} km</span>
            </div>
            <div className="text-[13px] text-ink-2">
              {r.conditions.length ? r.conditions.map((cnd) => <span key={cnd.name + cnd.condition} className={`mr-2 ${SEV[cnd.severity]}`}>{cnd.condition}</span>) : <span className="text-ink-3">No condition report</span>}
            </div>
            <div className="text-[12px] text-ink-3">
              Wind {wind(r.station.windMs, units)} · gusts {wind(r.station.gustMs, units)} · air {temp(r.station.airC, units)}
              {r.station.roadC != null ? ` · road ${temp(r.station.roadC, units)}` : ''} {r.station.time ? `· ${formatAge(r.station.time)}` : ''}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] text-ink-3">Source: Vegagerðin. For closures on your exact route, check umferdin.is before you leave.</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <a href="tel:112">
          <Press className="h-14 w-full text-[15px]" tabIndex={-1}>
            <Phone size={16} strokeWidth={1.75} aria-hidden /> Call 112
          </Press>
        </a>
        <Press className="h-14 w-full text-[15px]" onClick={onPlan ?? plan}>
          <Share2 size={16} strokeWidth={1.75} aria-hidden /> Share my plan
        </Press>
        <a href="https://safetravel.is/" target="_blank" rel="noreferrer">
          <Press className="h-12 w-full text-[14px]" tabIndex={-1}>SafeTravel.is</Press>
        </a>
        <a href="https://umferdin.is/" target="_blank" rel="noreferrer">
          <Press className="h-12 w-full text-[14px]" tabIndex={-1}>Road map</Press>
        </a>
      </div>
      {shared && <p className="mt-2 text-[13px] text-good" role="status">{shared}</p>}

      <h3 className="mb-2 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Driving & cold tips</h3>
      <ul className="space-y-3 pb-2 text-[14px] leading-snug">
        {TIPS.map((tp) => (
          <li key={tp.id}>
            <div className="font-medium">{tp.title}</div>
            <div className="text-ink-2">{tp.body}</div>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Cold-night checklist</h3>
      <ul className="space-y-2 pb-8 text-[14px] leading-snug text-ink-2">
        <li className="flex gap-2"><BatteryCharging size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />Cold drains batteries fast: keep your phone and spares in an inside pocket, and bring a power bank.</li>
        <li className="flex gap-2"><Snowflake size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />Dress for wind chill, not the thermometer. Wear layers, a hat, and gloves with touch-screen tips.</li>
        <li className="flex gap-2"><Wind size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />Park fully off the road with lights off, and never stop on the road or in a passing place.</li>
        <li className="flex gap-2"><ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />Don't trespass on farmland, keep away from shoreline waves, and use a red light, not white torches.</li>
      </ul>
    </Sheet>
  );
}

function Mini({ icon: I, k, v, tone }: { icon: typeof Wind; k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] px-2 py-3">
      <I size={14} strokeWidth={1.5} className="mx-auto text-ink-3" aria-hidden />
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
      <div className={`text-[17px] font-medium tabular-nums ${tone ?? ''}`}>{v}</div>
    </div>
  );
}
