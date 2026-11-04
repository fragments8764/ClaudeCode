import { motion } from 'motion/react';
import { CalendarDays, Moon, Star } from 'lucide-react';
import { rgb, scoreColor, spring } from '../design/tokens';
import { useOutlook } from '../lib/api';
import { hhmm } from '../lib/format';
import { useSettings } from '../lib/store';
import { Glass } from '../ui/Glass';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

/** 5-night outlook: score, best 2-hour window, cloud trend, moon impact, and a "Best night" pick. */
export function OutlookSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { location, minDarkness, nightVision } = useSettings();
  const q = useOutlook(location.lat, location.lon, minDarkness === 'astronomical', open);
  const nights = q.data?.data.nights ?? [];
  const best = nights.find((n) => n.best);
  const day = (d: string, i: number) => (i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : new Date(`${d}T12:00:00Z`).toLocaleDateString([], { weekday: 'long' }));
  return (
    <Sheet open={open} onClose={onClose} title="5-night outlook" initial="full" detents={['half', 'full']} header={<StatHeader id="outlook" icon={CalendarDays} label={`5-night outlook · ${location.label}`} value={best ? `Best: ${day(best.date, nights.indexOf(best))}` : q.isLoading ? '…' : 'No good night yet'} />}>
      {q.isError && !nights.length && <p className="text-[15px] text-poor">Outlook unavailable right now.</p>}
      {q.isLoading && !nights.length && <div className="skeleton h-40" />}
      <motion.ul className="space-y-3 pb-6" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.06 } } }}>
        {nights.map((n, i) => {
          const col = nightVision ? 'var(--c-text)' : rgb(scoreColor(n.score));
          return (
            <motion.li key={n.date} variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0, transition: spring } }}>
              <Glass radius="lg" className={`p-4 ${n.best ? 'shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.6),var(--glow)]' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-medium">{day(n.date, i)}</span>
                      {n.best && (
                        <span className="flex items-center gap-1 rounded-full bg-[rgb(var(--aurora-rgb)/0.25)] px-2 py-0.5 text-[11px]">
                          <Star size={11} strokeWidth={2} aria-hidden /> Best night
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-ink-2">
                      {n.window ? `Best ${hhmm(n.window.start)}–${hhmm(n.window.end)}` : 'No good window'} · cloud {n.meanCloud ?? '—'}%{n.kpMax != null ? ` · Kp ${n.kpMax.toFixed(0)}` : ''}
                    </div>
                  </div>
                  <div className="font-display text-[34px] font-light tabular-nums" style={{ color: col }} aria-label={`Score ${n.score}`}>
                    {n.score}
                  </div>
                </div>
                {/* cloud trend through the night */}
                <div className="mt-3 flex h-8 items-end gap-[2px]" role="img" aria-label={`Cloud through the night: ${n.cloudTrend.filter((x) => x != null).join(', ')} percent`}>
                  {n.cloudTrend.map((c, j) => (
                    <span key={j} className="flex-1 rounded-t-[2px] bg-[rgb(255_255_255/0.22)]" style={{ height: `${Math.max(6, c ?? 0)}%` }} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <Moon size={12} strokeWidth={1.75} aria-hidden /> {n.moon.label === 'none' ? 'Moon: no effect' : `Moon: ${n.moon.label} effect`} ({Math.round(n.moon.illumination * 100)}%)
                  </span>
                  {n.kpSource === '27-day' && <span className="whitespace-nowrap">Rough Kp (27-day outlook)</span>}
                </div>
              </Glass>
            </motion.li>
          );
        })}
      </motion.ul>
      <p className="pb-8 text-[12px] leading-relaxed text-ink-3">
        Night 1–3 Kp from NOAA's 3-day forecast, nights 4–5 from the 27-day outlook. Cloud from a 6-day Open-Meteo forecast. Beyond two days, treat this as a trend, not a promise.
      </p>
    </Sheet>
  );
}
