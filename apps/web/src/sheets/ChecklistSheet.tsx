import { buildChecklist, checklistDay } from '@nordurljos/core';
import { motion } from 'motion/react';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { springSnappy } from '../design/tokens';
import type { Conditions } from '../lib/conditions';
import { haptic } from '../lib/haptics';
import { activePlan } from '../lib/plan';
import { useSettings } from '../lib/store';
import { useSafetySummary } from './SafetySheet';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const KEY = 'nl-checklist';
function load(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { day?: string; ids?: string[] };
    return v.day === checklistDay() ? new Set(v.ids ?? []) : new Set(); // resets daily
  } catch {
    return new Set();
  }
}
function save(ids: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: checklistDay(), ids: [...ids] }));
  } catch {
    /* ignore */
  }
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${on ? 'bg-[rgb(var(--aurora-rgb))]' : 'shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.3)]'}`} aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <motion.path d="M3.5 8.5l3 3 6-7" fill="none" stroke="var(--c-base-0)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" initial={false} animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={springSnappy} />
      </svg>
    </span>
  );
}

/** Tonight's checklist — weather-aware, checkable, resets each day. */
export function ChecklistSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const hasCamera = useSettings((s) => s.hasCamera);
  const safety = useSafetySummary();
  const [done, setDone] = useState<Set<string>>(load);
  const w = c.clouds.data?.data.weather;
  const plan = activePlan();
  const items = buildChecklist({
    feelsLikeC: w?.feelsLike ?? null,
    airC: w?.temperature ?? null,
    gustMs: Math.max(w?.windGust ?? 0, safety.gust) || null,
    driving: !!plan || !!c.best,
    driveMin: null,
    hasCamera,
    iceRisk: (safety.d?.roads ?? []).some((r) => (r.station.roadC ?? 9) <= 0.5),
    darkHours: c.plan.darkIntervals.reduce((s, iv) => s + (Date.parse(iv.end) - Date.parse(iv.start)) / 3.6e6, 0),
  });
  const toggle = (id: string) => {
    haptic('select');
    const n = new Set(done);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setDone(n);
    save(n);
  };
  const count = items.filter((i) => done.has(i.id)).length;
  return (
    <Sheet open={open} onClose={onClose} title="Tonight's checklist" initial="full" detents={['half', 'full']} header={<StatHeader id="checklist" icon={ListChecks} label="Tonight's checklist" value={`${count} of ${items.length} packed`} tone={count === items.length ? 'text-good' : undefined} />}>
      <ul className="divide-y divide-[rgb(255_255_255/0.06)] pb-6">
        {items.map((i) => (
          <li key={i.id}>
            <button role="checkbox" aria-checked={done.has(i.id)} onClick={() => toggle(i.id)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
              <Tick on={done.has(i.id)} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] ${done.has(i.id) ? 'text-ink-3 line-through' : ''}`}>{i.label}</span>
                {i.why && <span className="block text-[12px] text-fair">{i.why}</span>}
              </span>
              {!i.essential && <span className="text-[11px] text-ink-3">nice to have</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="pb-8 text-[12px] text-ink-3">Built from tonight's temperature, wind, road ice and your preferences. Resets each day.</p>
    </Sheet>
  );
}
