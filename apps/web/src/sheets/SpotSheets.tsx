import { mapsLinks, roadTypeWarning, type RankedSpot } from '@nordurljos/core';
import { motion } from 'motion/react';
import { Car, Compass, MapPin, ParkingCircle, Share2, ShieldCheck, Sparkles, Star, TriangleAlert, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { spring } from '../design/tokens';
import { useRoute, useSafety } from '../lib/api';
import { useFeatures } from '../lib/features';
import { hhmm } from '../lib/format';
import { isApple, shareText } from '../lib/share';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';

function scoreTone(s: number) {
  return s >= 50 ? 'text-good' : s >= 25 ? 'text-fair' : 'text-ink-2';
}

export function driveLink(r: RankedSpot) {
  const l = mapsLinks(r.spot, r.spot.name);
  return isApple() ? l.apple : l.google;
}

export function planText(r: RankedSpot, from: string, windowEnd: string | null) {
  const back = windowEnd ? new Date(new Date(windowEnd).getTime() + r.driveMin * 60_000).toISOString() : null;
  return (
    `Aurora plan: driving from ${from} to ${r.spot.name} (${r.spot.region}), about ${r.driveMin} min each way.` +
    (back ? ` Expect to be back around ${hhmm(back)}.` : '') +
    ` Location: https://maps.google.com/?q=${r.spot.lat.toFixed(4)},${r.spot.lon.toFixed(4)} — Iceland emergency number 112.`
  );
}

const SEG_COLOR = { clear: 'var(--c-good)', slippery: 'var(--c-fair)', wind: 'var(--c-violet)', closed: 'var(--c-poor)', unknown: 'rgb(255 255 255 / 0.18)' } as const;
const SEG_LABEL = { clear: 'clear', slippery: 'slippery / ice', wind: 'gusts ≥ 15 m/s', closed: 'closed', unknown: 'no data' } as const;

/** Colour-coded road corridor from you to the spot (Vegagerðin stations along the way). */
export function RouteCorridor({ r }: { r: RankedSpot }) {
  const from = useSettings((s) => s.location);
  const enabled = useFeatures()('route.extras');
  const q = useRoute(from, enabled ? r.spot : null);
  if (!enabled) return null;
  const c = q.data?.data;
  const typeWarn = roadTypeWarning(r.spot.roadType, c?.segments.map((x) => x.condition).join(' '));
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">Roads on the way</h3>
      {q.isLoading && !c ? (
        <div className="skeleton h-3 rounded-full" />
      ) : c && c.segments.length ? (
        <>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`Road conditions along the route: ${c.segments.map((s) => `${s.station} ${SEG_LABEL[s.kind]}`).join(', ')}`}>
            {c.segments.map((s, i) => (
              <span key={s.station + i} className="flex-1" style={{ background: SEG_COLOR[s.kind] }} title={`${s.station}: ${s.condition ?? SEG_LABEL[s.kind]}${s.gustMs != null ? `, gusts ${Math.round(s.gustMs)} m/s` : ''}`} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-ink-3">
            <span>you</span>
            <span>
              {c.maxGust != null ? `max gust ${Math.round(c.maxGust)} m/s · ` : ''}
              {c.segments.length} stations
            </span>
            <span>spot</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
            {(['clear', 'slippery', 'wind', 'closed'] as const).map((k) => (
              <span key={k}>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SEG_COLOR[k] }} aria-hidden />
                {SEG_LABEL[k]}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">No road-weather stations along this route.</p>
      )}
      {(!!typeWarn || (c?.warnings.length ?? 0) > 0) && (
        <ul className="mt-3 space-y-1.5 text-[14px] leading-snug">
          {typeWarn && <li className="flex gap-2 text-fair"><TriangleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />{typeWarn}</li>}
          {c?.warnings.map((w) => (
            <li key={w} className="flex gap-2 text-ink-2"><TriangleAlert size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-fair" aria-hidden />{w}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-ink-3">Approximate corridor (stations within 15 km of the straight line). Check umferdin.is for your exact route.</p>
    </div>
  );
}

/** Return-time & road caveats for a trip. */
function TripSafety({ r, windowEnd }: { r: RankedSpot; windowEnd: string | null }) {
  const s = useSafety(r.spot.lat, r.spot.lon);
  const d = s.data?.data;
  const back = windowEnd ? new Date(new Date(windowEnd).getTime() + r.driveMin * 60_000) : null;
  const late = back ? back.getHours() >= 1 && back.getHours() < 7 : false;
  const roads = d?.roads ?? [];
  const worst = roads.flatMap((x) => x.conditions).find((c) => c.severity === 'closed') ?? roads.flatMap((x) => x.conditions).find((c) => c.severity === 'caution');
  const gust = Math.max(0, ...roads.map((x) => x.station.gustMs ?? 0));
  const cold = roads.find((x) => x.station.roadC != null)?.station.roadC;
  const items: string[] = [];
  if (back) items.push(`Back home around ${hhmm(back.toISOString())}${late ? ': a late one, so plan rest before driving' : ''}.`);
  if (worst) items.push(`${worst.name}: ${worst.condition}.`);
  if (gust >= 20) items.push(`Gusts up to ${Math.round(gust)} m/s near the route. Hold car doors firmly.`);
  if (cold != null && cold <= 0.5) items.push(`Road surface ${Math.round(cold)}°C: expect ice.`);
  const warn = d?.warnings.filter((w) => w.here !== false) ?? [];
  if (!items.length && !warn.length) return null;
  return (
    <div className="mt-4 rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] p-4">
      <div className="mb-1 flex items-center gap-2 text-[13px] font-medium text-fair">
        <TriangleAlert size={15} strokeWidth={1.75} aria-hidden /> Before you go
      </div>
      <ul className="space-y-1 text-[14px] leading-snug text-ink-2">
        {warn.map((w) => (
          <li key={w.id} className="text-fair">{w.headline}</li>
        ))}
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-3">
        Live roads: <a className="underline" href="https://umferdin.is/" target="_blank" rel="noreferrer">umferdin.is</a> · Travel safety:{' '}
        <a className="underline" href="https://safetravel.is/" target="_blank" rel="noreferrer">safetravel.is</a>
      </p>
    </div>
  );
}

function FavStar({ id, name }: { id: string; name: string }) {
  const { favoriteSpots, set } = useSettings();
  const on = favoriteSpots.includes(id);
  return (
    <button
      onClick={() => set('favoriteSpots', on ? favoriteSpots.filter((x) => x !== id) : [...favoriteSpots, id])}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourite spots` : `Add ${name} to favourite spots`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
    >
      <Star size={18} strokeWidth={1.75} className={on ? 'fill-[rgb(var(--aurora-rgb))] text-[rgb(var(--aurora-rgb))]' : 'text-ink-2'} aria-hidden />
    </button>
  );
}

function SpotFacts({ r }: { r: RankedSpot }) {
  const s = r.spot;
  const rows = [
    { icon: Compass, k: 'Best view', v: s.view },
    { icon: ParkingCircle, k: 'Parking', v: s.parking },
    { icon: Warehouse, k: 'Shelter', v: s.shelter },
    ...(s.access ? [{ icon: TriangleAlert, k: 'Access', v: s.access }] : []),
  ];
  return (
    <>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.notes}</p>
      <dl className="mt-3 space-y-2">
        {rows.map(({ icon: I, k, v }) => (
          <div key={k} className="flex gap-3 text-[14px]">
            <I size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            <dt className="w-20 shrink-0 text-ink-3">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
        <div className="flex gap-3 text-[14px]">
          <Sparkles size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
          <dt className="w-20 shrink-0 text-ink-3">Darkness</dt>
          <dd className="text-ink-2">Bortle ~{s.bortle} {s.bortle <= 2 ? '(very dark)' : s.bortle <= 4 ? '(rural)' : '(some light pollution)'}</dd>
        </div>
      </dl>
    </>
  );
}

function TripActions({ r, windowEnd, onPlan }: { r: RankedSpot; windowEnd: string | null; onPlan?: (r: RankedSpot) => void }) {
  const from = useSettings((s) => s.location.label);
  const [shared, setShared] = useState<string | null>(null);
  return (
    <div className="mt-5 flex gap-2">
      <a href={driveLink(r)} target="_blank" rel="noreferrer" className="flex-1">
        <Press variant="accent" hapticKind="success" className="h-14 w-full text-[16px] font-medium" tabIndex={-1}>
          <Car size={18} strokeWidth={1.75} aria-hidden /> Start driving
        </Press>
      </a>
      <Press
        className="h-14 w-14"
        aria-label="Share my plan"
        onClick={async () => (onPlan ? onPlan(r) : setShared(await shareText('My aurora plan', planText(r, from, windowEnd))))}
      >
        {onPlan ? <ShieldCheck size={18} strokeWidth={1.5} aria-hidden /> : <Share2 size={18} strokeWidth={1.5} aria-hidden />}
      </Press>
      {shared === 'copied' && <span className="sr-only" role="status">Plan copied</span>}
    </div>
  );
}

export function SpotSheet({ r, open, onClose, windowEnd, onPlan }: { r: RankedSpot | null; open: boolean; onClose: () => void; windowEnd: string | null; onPlan?: (r: RankedSpot) => void }) {
  return (
    <Sheet
      open={open && !!r}
      onClose={onClose}
      title={r?.spot.name ?? ''}
      initial="half"
      detents={['peek', 'half', 'full']}
      header={
        r && (
          <div className="flex items-center gap-3">
            <MapPin size={22} strokeWidth={1.5} className="text-ink-2" aria-hidden />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{r.spot.region}</div>
              <div className="truncate font-display text-2xl font-light">{r.spot.name}</div>
            </div>
            <FavStar id={r.spot.id} name={r.spot.name} />
          </div>
        )
      }
    >
      {r && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat k="Score" v={String(r.score)} tone={scoreTone(r.score)} />
            <Stat k="Cloud" v={r.cloud == null ? '—' : `${r.cloud}%`} tone={r.cloud != null && r.cloud <= 30 ? 'text-good' : undefined} />
            <Stat k="Drive" v={`${r.driveMin} min`} />
          </div>
          <TripActions r={r} windowEnd={windowEnd} onPlan={onPlan} />
          <RouteCorridor r={r} />
          <SpotFacts r={r} />
          <TripSafety r={r} windowEnd={windowEnd} />
          <p className="mt-4 pb-4 text-[12px] text-ink-3">Drive time is a straight-line estimate (×1.35, 70 km/h). Never trespass, and park only where it's allowed.</p>
        </>
      )}
    </Sheet>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] px-2 py-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
      <div className={`font-display text-2xl font-light tabular-nums ${tone ?? ''}`}>{v}</div>
    </div>
  );
}

/** "Best spot nearby" + route planner list. */
export function BestSpotSheet({
  ranked,
  open,
  onClose,
  onPick,
  atLabel,
  windowEnd,
  onPlan,
}: {
  ranked: RankedSpot[];
  open: boolean;
  onClose: () => void;
  onPick: (r: RankedSpot) => void;
  atLabel: string;
  windowEnd: string | null;
  onPlan?: (r: RankedSpot) => void;
}) {
  const { radiusKm, set } = useSettings();
  const best = ranked[0];
  return (
    <Sheet open={open} onClose={onClose} title="Best spot nearby" initial="half" detents={['peek', 'half', 'full']}>
      <p className="-mt-1 mb-3 text-[13px] text-ink-3">For {atLabel}. Ranked by clear sky, darkness, activity and light pollution.</p>
      <Segmented
        label="Search within"
        value={String(radiusKm)}
        options={[60, 120, 250, 500].map((v) => ({ value: String(v), label: `${v} km` }))}
        onChange={(v) => set('radiusKm', Number(v))}
      />
      {!best ? (
        <p className="mt-4 text-[15px] text-ink-2">No curated spots within {radiusKm} km. Widen the search.</p>
      ) : (
        <>
          <motion.button
            layout
            transition={spring}
            onClick={() => onPick(best)}
            className="mt-4 w-full rounded-[var(--r-lg)] bg-[rgb(var(--aurora-rgb)/0.12)] p-4 text-left shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.35)]"
          >
            <div className="text-[11px] uppercase tracking-wider text-ink-3">{best.clearAndDark ? 'Clear & dark' : 'Best available'}</div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-display text-2xl font-light">{best.spot.name}</div>
              <div className={`font-display text-3xl font-light tabular-nums ${scoreTone(best.score)}`}>{best.score}</div>
            </div>
            <div className="text-[14px] text-ink-2">
              {best.cloud == null ? 'cloud ?' : `${best.cloud}% cloud`} · {best.distanceKm} km · ~{best.driveMin} min drive
            </div>
          </motion.button>
          <TripActions r={best} windowEnd={windowEnd} onPlan={onPlan} />
          <RouteCorridor r={best} />
          <h3 className="mb-1 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Other options</h3>
          <ul className="divide-y divide-[rgb(255_255_255/0.06)] pb-6">
            {ranked.slice(1, 8).map((r) => (
              <li key={r.spot.id}>
                <button onClick={() => onPick(r)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${r.clearAndDark ? 'bg-good' : 'bg-ink-3'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.spot.name}</span>
                    <span className="block text-[13px] text-ink-3">
                      {r.cloud == null ? '?' : `${r.cloud}%`} cloud · {r.distanceKm} km · ~{r.driveMin} min
                    </span>
                  </span>
                  <span className={`font-display text-xl font-light tabular-nums ${scoreTone(r.score)}`}>{r.score}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}
