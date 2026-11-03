import { motion } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { spring } from '../design/tokens';
import { postOrQueue } from '../lib/outbox';
import type { Conditions } from '../lib/conditions';
import { haptic } from '../lib/haptics';
import { badges, useJournal } from '../lib/journal';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Section } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const COLORS: [string, string][] = [
  ['green', '#4ade80'],
  ['pink', '#f472b6'],
  ['purple', '#a78bfa'],
  ['red', '#ef4444'],
  ['white', '#e2e8f0'],
  ['blue', '#60a5fa'],
];
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'overhead'];
const BRIGHT = ['Faint', 'Weak', 'Clear', 'Bright', 'Brilliant'];

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      aria-pressed={on}
      aria-label={label}
      onClick={() => {
        haptic('select');
        onClick();
      }}
      className={`min-h-[44px] min-w-[44px] rounded-full px-3.5 text-[14px] ${on ? 'bg-[rgb(var(--aurora-rgb)/0.25)] shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.8)]' : 'bg-[rgb(255_255_255/0.06)] text-ink-2'}`}
    >
      {children}
    </button>
  );
}

/** One-tap "I see aurora!" — shares an anonymous (~10 km) report and logs it in your journal. */
export function SightingSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const location = useSettings((s) => s.location);
  const { add, entries } = useJournal();
  const [brightness, setBrightness] = useState(3);
  const [colors, setColors] = useState<string[]>(['green']);
  const [dir, setDir] = useState('N');
  const [share, setShare] = useState(true);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error' | 'queued'>('idle');
  const [newBadges, setNewBadges] = useState<string[]>([]);

  const submit = async () => {
    setState('sending');
    const before = new Set(badges(entries).filter((b) => b.earned).map((b) => b.id));
    add({
      place: location.label,
      lat: location.lat,
      lon: location.lon,
      saw: true,
      brightness,
      colors,
      score: c.score?.score ?? null,
      kp: c.sw.data?.data.kp.now?.kp ?? null,
      cloud: c.clouds.data?.data.effective ?? null,
      notes: '',
    });
    const after = badges(useJournal.getState().entries).filter((b) => b.earned && !before.has(b.id));
    setNewBadges(after.map((b) => b.name));
    try {
      const r = share ? await postOrQueue('/api/sightings', { lat: location.lat, lon: location.lon, brightness, colors, direction: dir, at: new Date().toISOString() }) : 'sent';
      haptic('success');
      setState(r === 'queued' ? 'queued' : 'done');
    } catch {
      setState('error');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => {
        setState('idle');
        setNewBadges([]);
        onClose();
      }}
      title="I see aurora!"
      initial="full"
      detents={['half', 'full']}
      header={<StatHeader id="sighting" icon={Sparkles} label="Log a sighting" value="I see aurora!" />}
    >
      {state === 'done' || state === 'error' || state === 'queued' ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="py-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[rgb(var(--aurora-rgb)/0.25)] shadow-[var(--glow)]">
            <Check size={28} strokeWidth={1.75} aria-hidden />
          </div>
          <h3 className="mt-4 font-display text-2xl font-light">Logged in your journal</h3>
          <p className="mt-1 text-[15px] text-ink-2">
            {state === 'queued'
              ? 'No signal: saved on your phone, and the community report will send automatically when you’re back in range.'
              : state === 'error'
                ? 'Saved on your phone; the community report could not be sent.'
                : share
                  ? 'Thanks! Your report helps others nearby.'
                  : 'Kept private on this device.'}
          </p>
          {newBadges.map((b) => (
            <p key={b} className="mt-3 text-[15px] text-good">
              New badge: {b}
            </p>
          ))}
          <Press className="mx-auto mt-6 h-12 px-8" onClick={onClose}>
            Back to the sky
          </Press>
        </motion.div>
      ) : (
        <>
          <Section title="How bright?">
            <div className="flex flex-wrap gap-2 py-2">
              {BRIGHT.map((b, i) => (
                <Chip key={b} on={brightness === i + 1} onClick={() => setBrightness(i + 1)}>
                  {b}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Colours">
            <div className="flex flex-wrap gap-2 py-2">
              {COLORS.map(([name, hex]) => (
                <Chip key={name} label={name} on={colors.includes(name)} onClick={() => setColors((cs) => (cs.includes(name) ? cs.filter((x) => x !== name) : [...cs, name]))}>
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: hex }} aria-hidden />
                  <span className="capitalize">{name}</span>
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Direction">
            <div className="flex flex-wrap gap-2 py-2">
              {DIRS.map((d) => (
                <Chip key={d} on={dir === d} onClick={() => setDir(d)}>
                  {d === 'overhead' ? 'Overhead' : d}
                </Chip>
              ))}
            </div>
          </Section>
          <label className="mt-4 flex min-h-[48px] items-center gap-3 text-[14px] text-ink-2">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--aurora-rgb))]" />
            Share anonymously on the community map (location rounded to ~10 km, removed after 12 h)
          </label>
          <Press variant="accent" hapticKind={false} onClick={submit} disabled={state === 'sending'} className="mb-8 mt-4 h-14 w-full text-[16px] font-medium">
            <Sparkles size={18} strokeWidth={1.75} aria-hidden /> {state === 'sending' ? 'Saving…' : 'Log it'}
          </Press>
        </>
      )}
    </Sheet>
  );
}
