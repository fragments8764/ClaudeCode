import { motion } from 'motion/react';
import { CalendarClock, Car, Sparkles } from 'lucide-react';
import { NightTimeline } from '../components/NightTimeline';
import { scoreColor, rgb, spring } from '../design/tokens';
import type { Conditions } from '../lib/conditions';
import { hhmm, until, whenDay } from '../lib/format';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

/**
 * Smart night planner: sunset → dark → moon → cloud gaps → Kp peaks → best 2-hour window,
 * with a live countdown and a jump to the best spot.
 */
export function PlannerSheet({ c, open, onClose, onFindSpot }: { c: Conditions; open: boolean; onClose: () => void; onFindSpot: () => void }) {
  const p = c.plan;
  const best = c.best;
  const nowMs = c.now.getTime();
  const inBest = best && nowMs >= new Date(best.start).getTime() && nowMs < new Date(best.end).getTime();
  const kp = (c.sw.data?.data.kp.series ?? []).filter((x) => x.time >= new Date(nowMs - 3 * 3.6e6).toISOString()).slice(0, 8);
  const kpPeak = kp.reduce<(typeof kp)[number] | null>((a, b) => (!a || b.kp > a.kp ? b : a), null);
  const gaps = c.outlook.filter((h) => h.dark >= 0.6 && h.cloud != null && h.cloud <= 35);
  const maxScore = Math.max(10, ...c.outlook.map((h) => h.score));

  const events: { t: string | null; label: string }[] = [
    { t: p.sunset, label: 'Sunset' },
    { t: p.darkNow ? null : p.darkStart, label: 'Dark enough for aurora' },
    { t: p.astroDarkStart, label: 'Fully dark' },
    { t: p.moonrise, label: `Moonrise (${Math.round(p.moon.illumination * 100)}% lit)` },
    { t: p.moonset, label: 'Moonset' },
    { t: gaps[0]?.time ?? null, label: `First clear spell (${gaps[0]?.cloud ?? ''}% cloud)` },
    { t: kpPeak && kpPeak.time > c.now.toISOString() ? kpPeak.time : null, label: `Kp peak ${kpPeak?.kp.toFixed(1) ?? ''}` },
    { t: p.darkEnd, label: 'Darkness ends' },
  ]
    .filter((e): e is { t: string; label: string } => !!e.t && new Date(e.t).getTime() >= nowMs - 30 * 60_000)
    .sort((a, b) => a.t.localeCompare(b.t));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Tonight's plan"
      initial="full"
      detents={['half', 'full']}
      header={<StatHeader id="planner" icon={CalendarClock} label="Tonight's plan" value={best ? `${hhmm(best.start)}–${hhmm(best.end)}` : 'No good window'} />}
    >
      {best ? (
        <div className="rounded-[var(--r-lg)] bg-[rgb(var(--aurora-rgb)/0.12)] p-4 shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.3)]">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{inBest ? 'Best window is now' : 'Best viewing window'}</div>
          <div className="font-display text-[34px] font-light tabular-nums leading-tight">{inBest ? `${until(nowMs, best.end)} left` : `in ${until(nowMs, best.start)}`}</div>
          <div className="text-[14px] text-ink-2">
            {whenDay(best.start, c.now)} – {hhmm(best.end)} · window score {best.score}
          </div>
          <div className="mt-3 flex gap-2">
            <Press variant="accent" hapticKind="select" onClick={onFindSpot} className="h-12 flex-1 text-[15px] font-medium">
              <Car size={17} strokeWidth={1.75} aria-hidden /> Find a spot & drive
            </Press>
          </div>
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed text-ink-2">Nothing promising in the next 18 hours. Clouds, daylight or a quiet sun are in the way. Check back later; forecasts change.</p>
      )}

      <h3 className="mb-2 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Hour by hour</h3>
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Forecast aurora score by hour">
        {c.outlook.map((h, i) => (
          <motion.div
            key={h.time}
            className="flex-1 rounded-t-[4px]"
            style={{ background: h.dark < 0.2 ? 'rgb(255 255 255 / 0.12)' : rgb(scoreColor(h.score), 0.75) }}
            initial={{ height: 2 }}
            animate={{ height: `${Math.max(4, (h.score / maxScore) * 100)}%` }}
            transition={{ ...spring, delay: i * 0.02 }}
            title={`${hhmm(h.time)}: score ${h.score}, cloud ${h.cloud ?? '?'}%`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ink-3">
        {c.outlook.filter((_, i) => i % 4 === 0).map((h) => (
          <span key={h.time}>{hhmm(h.time)}</span>
        ))}
      </div>
      <p className="mt-1 text-[12px] text-ink-3">Forecast score uses cloud, darkness, moon and the Kp forecast; live Bz can't be forecast hours ahead.</p>

      <h3 className="mb-1 mt-6 text-[11px] uppercase tracking-[0.22em] text-ink-3">Timeline</h3>
      <ol className="relative ml-2 border-l border-[rgb(255_255_255/0.12)]">
        {events.map((e) => (
          <li key={e.label + e.t} className="relative py-2 pl-5">
            <span className="absolute -left-[5px] top-[15px] h-2.5 w-2.5 rounded-full bg-[rgb(var(--aurora-rgb))]" aria-hidden />
            <span className="mr-3 font-display text-lg font-light tabular-nums">{hhmm(e.t)}</span>
            <span className="text-[14px] text-ink-2">{e.label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <NightTimeline plan={p} clouds={c.clouds.data?.data.hourly ?? []} illumination={p.moon.illumination} />
      </div>
      <p className="mt-4 flex items-center gap-2 pb-6 text-[12px] text-ink-3">
        <Sparkles size={13} strokeWidth={1.5} aria-hidden /> Tip: arrive 20 minutes early so your eyes can adapt.
      </p>
    </Sheet>
  );
}
