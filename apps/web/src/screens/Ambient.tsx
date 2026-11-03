import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Conditions } from '../lib/conditions';
import { hhmm } from '../lib/format';
import { useT } from '../lib/i18n';
import { useSettings } from '../lib/store';
import { ScoreRing } from '../ui/ScoreRing';

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Ambient mode: a calm always-on screen (sky + score) for a dashboard or car mount.
 * Keeps the screen awake (Wake Lock API) and auto-dims after 20 s; tap to wake.
 */
export function Ambient({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const night = useSettings((s) => s.nightVision);
  const t = useT();
  const [dim, setDim] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lock = useRef<WakeLockSentinelLike | null>(null);

  const wake = () => {
    setDim(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDim(true), 20_000);
  };

  useEffect(() => {
    if (!open) return;
    wake();
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
    const req = () => nav.wakeLock?.request('screen').then((l) => (lock.current = l)).catch(() => {});
    req();
    const vis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', vis);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', vis);
      lock.current?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 flex flex-col items-center justify-center" style={{ zIndex: 'var(--z-sheet)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onPointerDown={wake} role="dialog" aria-label="Ambient mode">
          <div className="absolute inset-0 bg-[rgb(2_4_10/0.25)]" aria-hidden />
          <div className="relative text-center">
            <div className="on-sky font-display text-[64px] font-extralight tabular-nums leading-none text-ink-2">{hhmm(c.now.toISOString())}</div>
            <div className="mt-6">
              <ScoreRing score={c.score?.score ?? null} size={300} night={night} />
            </div>
            <div className="on-sky mt-6 font-display text-[30px] font-light">{c.score ? t(`verdict.${c.score.verdict}`) : ''}</div>
            {c.best && <div className="on-sky mt-1 text-[15px] text-ink-2">{t('best.tonight')} {hhmm(c.best.start)}–{hhmm(c.best.end)}</div>}
          </div>
          <button onClick={onClose} aria-label="Exit ambient mode" className="glass absolute right-5 top-[max(20px,env(safe-area-inset-top))] grid h-12 w-12 place-items-center rounded-full">
            <X size={18} strokeWidth={1.5} aria-hidden />
          </button>
          {/* auto-dim layer: GPU-cheap opacity only */}
          <motion.div className="pointer-events-none absolute inset-0 bg-black" animate={{ opacity: dim ? 0.62 : 0 }} transition={{ duration: 2.5 }} aria-hidden />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
