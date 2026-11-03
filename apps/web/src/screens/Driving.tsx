import { AnimatePresence, motion } from 'motion/react';
import { Volume2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Gap } from '@nordurljos/core';
import type { Conditions } from '../lib/conditions';
import { hhmm, until } from '../lib/format';
import { useT } from '../lib/i18n';
import { speak } from '../lib/voice';

/** Driving mode: huge, glanceable, zero required interaction. Spoken alerts run in the background. */
export function DrivingMode({ c, open, onClose, gap, auto }: { c: Conditions; open: boolean; onClose: () => void; gap: Gap | undefined; auto: boolean }) {
  const t = useT();
  const s = c.score;
  const best = c.best;
  const line = s ? `${t(`verdict.${s.verdict}`)}. Score ${s.score}.` : '';
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 flex flex-col bg-black px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))]" style={{ zIndex: 'var(--z-sheet)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-label="Driving mode">
          <div className="text-[13px] uppercase tracking-[0.25em] text-ink-3">{auto ? 'Driving mode · on automatically' : 'Driving mode'}</div>
          <div className="flex flex-1 flex-col justify-center" aria-live="polite">
            <div className="font-display text-[120px] font-extralight leading-none tabular-nums">{s?.score ?? '—'}</div>
            <div className="mt-3 font-display text-[40px] font-light leading-tight">{s ? t(`verdict.${s.verdict}`) : ''}</div>
            {gap && <div className="mt-4 text-[22px] leading-snug text-ink-2">{gap.summary}</div>}
            {!gap && best && <div className="mt-4 text-[22px] text-ink-2">Best {hhmm(best.start)}–{hhmm(best.end)} · {until(c.now.getTime(), best.start)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => speak(`${line} ${gap?.summary ?? ''}`, true)} className="flex h-20 items-center justify-center gap-2 rounded-[var(--r-xl)] bg-[rgb(255_255_255/0.08)] text-[20px]" aria-label="Read aloud">
              <Volume2 size={24} strokeWidth={1.5} aria-hidden /> Read aloud
            </button>
            <button onClick={onClose} className="flex h-20 items-center justify-center gap-2 rounded-[var(--r-xl)] bg-[rgb(255_255_255/0.08)] text-[20px]" aria-label="Exit driving mode">
              <X size={24} strokeWidth={1.5} aria-hidden /> Exit
            </button>
          </div>
          <p className="mt-3 text-center text-[13px] text-ink-3">Never interact while driving. Alerts are spoken. Park safely off the road to look.</p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
