import { brightnessFrom, expectation, npfSeconds, rule500Seconds, suggestExposure } from '@nordurljos/core';
import { AnimatePresence, motion } from 'motion/react';
import { Aperture, Eye, Timer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { spring } from '../design/tokens';
import type { Conditions } from '../lib/conditions';
import { haptic } from '../lib/haptics';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Section, Segmented } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const fmtShutter = (s: number) => (s >= 1 ? `${s}″` : `1/${Math.round(1 / s)}`);

/** Long-exposure / interval timer with big digits and haptic ticks. */
function ExposureTimer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState<number | null>(null);
  const end = useRef(0);
  useEffect(() => {
    if (left === null) return;
    const id = setInterval(() => {
      const l = Math.max(0, (end.current - performance.now()) / 1000);
      if (Math.ceil(l) !== Math.ceil(left)) haptic('tick');
      setLeft(l);
      if (l <= 0) {
        haptic('success');
        setLeft(null);
      }
    }, 100);
    return () => clearInterval(id);
  }, [left]);
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="font-display text-[44px] font-extralight tabular-nums leading-none" aria-live="polite">
        {left === null ? `${seconds}s` : `${left.toFixed(1)}s`}
      </div>
      <Press
        className="ml-auto h-12 px-6"
        onClick={() => {
          if (left !== null) return setLeft(null);
          end.current = performance.now() + seconds * 1000;
          setLeft(seconds);
        }}
      >
        <Timer size={16} strokeWidth={1.75} aria-hidden /> {left === null ? 'Start' : 'Stop'}
      </Press>
    </div>
  );
}

export function PhotoSheet({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const { lens, set } = useSettings();
  const kp = c.sw.data?.data.kp.now?.kp ?? null;
  const b = brightnessFrom(kp, c.score?.score ?? null);
  const [level, setLevel] = useState<number | null>(null);
  const bright = (level ?? b) as 0 | 1 | 2 | 3;
  const moonUpBright = c.plan.moon.altitudeDeg > 5 && c.plan.moon.illumination > 0.5;
  const s = suggestExposure(bright, { focalMm: lens.focalMm * lens.crop, aperture: lens.aperture, moonUpBright, phone: lens.phone });
  const ex = expectation(bright);
  const npf = npfSeconds(lens.focalMm * lens.crop, lens.aperture);
  const r500 = rule500Seconds(lens.focalMm, lens.crop);
  return (
    <Sheet open={open} onClose={onClose} title="Photographer mode" initial="full" detents={['half', 'full']} header={<StatHeader id="photo" icon={Aperture} label="Photographer mode" value={`ISO ${s.iso} · ${fmtShutter(s.shutter)} · f/${s.aperture}`} />}>
      <Segmented
        label="Aurora brightness"
        value={String(bright)}
        options={['Faint', 'Moderate', 'Bright', 'Storm'].map((l, i) => ({ value: String(i), label: i === b && level === null ? `${l} ·` : l }))}
        onChange={(v) => setLevel(Number(v))}
      />
      <AnimatePresence mode="popLayout">
        <motion.div key={`${bright}-${lens.focalMm}-${lens.aperture}-${lens.phone}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            ['ISO', String(s.iso)],
            ['Shutter', fmtShutter(s.shutter)],
            ['Aperture', `f/${s.aperture}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] py-3">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">{k}</div>
              <div className="font-display text-3xl font-light tabular-nums">{v}</div>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
        {s.note} {moonUpBright ? 'The bright moon lights the landscape, so ISO has been lowered.' : ''}
      </p>

      <Section title="Your lens">
        <Segmented label="Camera" value={lens.phone ? 'phone' : lens.crop === 1 ? 'ff' : 'apsc'} options={[{ value: 'ff', label: 'Full frame' }, { value: 'apsc', label: 'APS-C' }, { value: 'phone', label: 'Phone' }]} onChange={(v) => set('lens', { ...lens, phone: v === 'phone', crop: v === 'apsc' ? 1.5 : 1 })} />
        {!lens.phone && (
          <>
            <Segmented label="Focal length" value={String(lens.focalMm)} options={[14, 20, 24, 35].map((f) => ({ value: String(f), label: `${f} mm` }))} onChange={(v) => set('lens', { ...lens, focalMm: Number(v) })} />
            <Segmented label="Widest aperture" value={String(lens.aperture)} options={[1.4, 1.8, 2.8, 4].map((a) => ({ value: String(a), label: `f/${a}` }))} onChange={(v) => set('lens', { ...lens, aperture: Number(v) })} />
            <p className="pb-2 text-[13px] text-ink-3">
              Sharp-star limit: <span className="text-ink-2">{npf}s</span> (NPF rule) · {r500}s (500 rule, slight trails)
            </p>
          </>
        )}
      </Section>

      <Section title="Long-exposure timer">
        <ExposureTimer seconds={Math.max(1, Math.round(s.shutter))} />
      </Section>

      <Section title="What you'll actually see">
        <div className="space-y-2 py-2 text-[14px] leading-relaxed">
          <p className="flex gap-2 text-ink-2"><Eye size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden /><span><span className="text-ink">Eyes:</span> {ex.eye}</span></p>
          <p className="flex gap-2 text-ink-2"><Aperture size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden /><span><span className="text-ink">Camera:</span> {ex.camera}</span></p>
        </div>
      </Section>

      <Section title="Focus on a star">
        <ol className="list-decimal space-y-1.5 py-2 pl-5 pb-8 text-[14px] leading-snug text-ink-2">
          <li>Switch the lens and camera to manual focus (MF). Turn off stabilisation on a tripod.</li>
          <li>Open live view, aim at the brightest star (or a distant light), and zoom the screen to 10×.</li>
          <li>Turn the focus ring slowly until the star is the smallest, sharpest dot, then tape the ring.</li>
          <li>Use a 2-second timer or remote, shoot RAW, and keep a spare battery warm in a pocket.</li>
        </ol>
      </Section>
    </Sheet>
  );
}
