import { brightnessFrom, expectation, npfSeconds, rule500Seconds, suggestExposure, suggestFromShots, type Brightness, type ShotEntry } from '@nordurljos/core';
import { useShots } from '../lib/shots';
import { idbGet, idbSet, thumbnail } from '../lib/idb';
import { AnimatePresence, motion } from 'motion/react';
import { Aperture, Camera as CameraIcon, Eye, ImagePlus, Sparkles, Timer, Trash2 } from 'lucide-react';
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

      <ShotLog bright={bright} suggestion={s} c={c} />

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

function Thumb({ k }: { k: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    idbGet<string>(k).then((v) => setSrc(v ?? null)).catch(() => {});
  }, [k]);
  return src ? <img src={src} alt="Your aurora shot" className="h-14 w-14 shrink-0 rounded-[12px] object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[12px] bg-[rgb(255_255_255/0.06)]"><CameraIcon size={16} strokeWidth={1.5} className="text-ink-3" aria-hidden /></span>;
}

/** Shot log: save settings + conditions with each photo; learn from your best shots. */
function ShotLog({ bright, suggestion, c }: { bright: Brightness; suggestion: { iso: number; shutter: number; aperture: number }; c: Conditions }) {
  const { shots, add, remove } = useShots();
  const lens = useSettings((st) => st.lens);
  const mine = suggestFromShots(shots, bright);
  const [iso, setIso] = useState(String(suggestion.iso));
  const [shutter, setShutter] = useState(String(suggestion.shutter));
  const [aperture, setAperture] = useState(String(suggestion.aperture));
  const [rating, setRating] = useState<ShotEntry['rating']>('good');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setIso(String(suggestion.iso));
    setShutter(String(suggestion.shutter));
    setAperture(String(suggestion.aperture));
  }, [suggestion.iso, suggestion.shutter, suggestion.aperture]);
  const field = 'h-11 w-full rounded-[var(--r-sm)] bg-[rgb(255_255_255/0.07)] px-3 text-[16px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--aurora-rgb))]';
  return (
    <Section title="Shot log">
      {mine && (
        <div className="my-2 flex items-start gap-2 rounded-[var(--r-md)] bg-[rgb(var(--aurora-rgb)/0.12)] p-3 text-[14px]">
          <Sparkles size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            From your best shots: <span className="font-medium tabular-nums">ISO {mine.iso} · {fmtShutter(mine.shutter)} · f/{mine.aperture}</span>
            <span className="block text-[12px] text-ink-3">{mine.note}</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 py-2">
        <label className="text-[12px] text-ink-3">ISO<input inputMode="numeric" value={iso} onChange={(e) => setIso(e.target.value)} className={field} /></label>
        <label className="text-[12px] text-ink-3">Shutter (s)<input inputMode="decimal" value={shutter} onChange={(e) => setShutter(e.target.value)} className={field} /></label>
        <label className="text-[12px] text-ink-3">Aperture f/<input inputMode="decimal" value={aperture} onChange={(e) => setAperture(e.target.value)} className={field} /></label>
      </div>
      <div className="flex gap-2 py-1" role="radiogroup" aria-label="How did it turn out?">
        {(['good', 'ok', 'bad'] as const).map((r) => (
          <button key={r} role="radio" aria-checked={rating === r} onClick={() => setRating(r)} className={`min-h-[44px] flex-1 rounded-full text-[14px] capitalize ${rating === r ? 'bg-[rgb(var(--aurora-rgb)/0.25)] shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.8)]' : 'bg-[rgb(255_255_255/0.06)] text-ink-2'}`}>
            {r === 'good' ? 'Great' : r === 'ok' ? 'Okay' : 'Missed'}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={140} className={`${field} mt-2`} aria-label="Note" />
      <div className="mt-2 flex gap-2">
        <label className="flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-[rgb(255_255_255/0.06)] text-[14px]">
          <ImagePlus size={16} strokeWidth={1.5} aria-hidden /> {photo ? 'Photo added' : 'Add photo'}
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => e.target.files?.[0] && setPhoto(await thumbnail(e.target.files[0]))} />
        </label>
        <Press
          className="h-12 flex-1 text-[15px]"
          variant="accent"
          hapticKind="success"
          onClick={async () => {
            let photoKey: string | null = null;
            if (photo) {
              photoKey = `shot-${Date.now()}`;
              await idbSet(photoKey, photo).catch(() => (photoKey = null));
            }
            add({
              iso: Number(iso) || suggestion.iso,
              shutter: Number(shutter) || suggestion.shutter,
              aperture: Number(aperture) || suggestion.aperture,
              focalMm: lens.focalMm,
              brightness: bright,
              rating,
              score: c.score?.score ?? null,
              kp: c.sw.data?.data.kp.now?.kp ?? null,
              cloud: c.clouds.data?.data.effective ?? null,
              moonIllumination: c.plan.moon.illumination,
              note,
              photoKey,
            });
            setNote('');
            setPhoto(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          {saved ? 'Logged ✓' : 'Log this shot'}
        </Press>
      </div>
      {shots.length > 0 && (
        <ul className="mt-3 divide-y divide-[rgb(255_255_255/0.06)]">
          {shots.slice(0, 8).map((sh) => (
            <li key={sh.id} className="flex items-center gap-3 py-2">
              {sh.photoKey ? <Thumb k={sh.photoKey} /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[12px] bg-[rgb(255_255_255/0.06)] text-[12px] text-ink-3">{sh.rating}</span>}
              <div className="min-w-0 flex-1 text-[13px]">
                <div className="tabular-nums">ISO {sh.iso} · {fmtShutter(sh.shutter)} · f/{sh.aperture} · {sh.focalMm} mm</div>
                <div className="truncate text-ink-3">
                  {new Date(sh.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · Kp {sh.kp?.toFixed(1) ?? '—'} · {sh.rating === 'good' ? 'great' : sh.rating}
                  {sh.note ? ` · ${sh.note}` : ''}
                </div>
              </div>
              <button aria-label="Delete shot" onClick={() => remove(sh.id)} className="grid h-11 w-11 place-items-center text-ink-3">
                <Trash2 size={15} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="pb-2 pt-1 text-[12px] text-ink-3">Stored on this phone only. Photos are shrunk and stripped of location data before saving.</p>
    </Section>
  );
}
