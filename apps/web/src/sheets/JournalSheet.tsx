import { Award, BookOpen, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Conditions } from '../lib/conditions';
import { hhmm } from '../lib/format';
import { badges, stats, useJournal } from '../lib/journal';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Section } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

export function JournalSheet({ c, open, onClose, onPostcard }: { c: Conditions; open: boolean; onClose: () => void; onPostcard: () => void }) {
  const { entries, add, remove } = useJournal();
  const location = useSettings((s) => s.location);
  const st = stats(entries);
  const bs = badges(entries);
  const [logged, setLogged] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Journal" initial="full" detents={['half', 'full']} header={<StatHeader id="journal" icon={BookOpen} label="Your aurora journal" value={`${st.nightsSeen} of ${st.nightsOut} nights`} />}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Box k="Nights out" v={String(st.nightsOut)} />
        <Box k="Saw aurora" v={String(st.nightsSeen)} />
        <Box k="Best Kp" v={st.bestKp == null ? '—' : st.bestKp.toFixed(1)} />
      </div>
      <div className="mt-3 flex gap-2">
        <Press
          className="h-12 flex-1 text-[14px]"
          disabled={logged}
          onClick={() => {
            add({ place: location.label, lat: location.lat, lon: location.lon, saw: false, brightness: null, colors: [], score: c.score?.score ?? null, kp: c.sw.data?.data.kp.now?.kp ?? null, cloud: c.clouds.data?.data.effective ?? null, notes: '' });
            setLogged(true);
          }}
        >
          {logged ? 'Logged ✓' : 'Log a night out'}
        </Press>
        <Press className="h-12 flex-1 text-[14px]" onClick={onPostcard}>
          Make a postcard
        </Press>
      </div>

      <Section title="Badges">
        <ul className="grid grid-cols-2 gap-2 py-2">
          {bs.map((b) => (
            <li key={b.id} className={`rounded-[var(--r-md)] p-3 ${b.earned ? 'bg-[rgb(var(--aurora-rgb)/0.14)] shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.4)]' : 'bg-[rgb(255_255_255/0.04)]'}`}>
              <Award size={18} strokeWidth={1.5} className={b.earned ? 'text-[rgb(var(--aurora-rgb))]' : 'text-ink-3'} aria-hidden />
              <div className={`mt-1 text-[14px] font-medium ${b.earned ? '' : 'text-ink-3'}`}>{b.name}</div>
              <div className="text-[12px] text-ink-3">{b.earned ? 'Earned' : b.hint}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Nights">
        {entries.length === 0 && <p className="py-3 text-[14px] text-ink-3">Nothing yet. Tap "I see aurora!" when it happens, or log a night out.</p>}
        {entries.slice(0, 60).map((e) => (
          <div key={e.id} className="flex items-center gap-3 py-3">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${e.saw ? 'bg-good' : 'bg-ink-3'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">
                {new Date(e.at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · {e.place}
              </div>
              <div className="text-[13px] text-ink-3">
                {e.saw ? `Saw it at ${hhmm(e.at)}${e.colors.length ? ` · ${e.colors.join(', ')}` : ''}` : 'No aurora'} · score {e.score ?? '—'} · Kp {e.kp?.toFixed(1) ?? '—'}
              </div>
            </div>
            <button aria-label="Delete entry" onClick={() => remove(e.id)} className="grid h-11 w-11 place-items-center rounded-full text-ink-3">
              <Trash2 size={16} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        ))}
      </Section>
      <p className="pb-8 pt-2 text-[12px] text-ink-3">Your journal stays on this phone.</p>
    </Sheet>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] px-2 py-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
      <div className="font-display text-2xl font-light tabular-nums">{v}</div>
    </div>
  );
}
