import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';
import { springSoft } from '../design/tokens';
import { haptic } from '../lib/haptics';
import { useReducedMotionPref } from '../lib/store';

/** Pull down from the top to refresh; a glowing aurora ribbon grows with the pull. */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const pull = useMotionValue(0);
  const reduced = useReducedMotionPref();
  const start = useRef<number | null>(null);
  const armed = useRef(false);
  const [busy, setBusy] = useState(false);
  const ribbonOpacity = useTransform(pull, [0, 80], [0, 1]);
  const ribbonScale = useTransform(pull, [0, 120], [0.3, 1]);
  const TH = 80;

  return (
    <div
      onTouchStart={(e) => {
        start.current = window.scrollY <= 0 && !busy ? e.touches[0]!.clientY : null;
      }}
      onTouchMove={(e) => {
        if (start.current == null) return;
        const d = Math.max(0, e.touches[0]!.clientY - start.current);
        pull.set(Math.min(140, d * 0.5));
        if (pull.get() >= TH && !armed.current) {
          armed.current = true;
          haptic('tick');
        } else if (pull.get() < TH) armed.current = false;
      }}
      onTouchEnd={async () => {
        if (start.current == null) return;
        start.current = null;
        if (pull.get() >= TH) {
          setBusy(true);
          haptic('select');
          animate(pull, 70, springSoft);
          await onRefresh().catch(() => {});
          setBusy(false);
        }
        armed.current = false;
        animate(pull, 0, springSoft);
      }}
    >
      <motion.div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-28" style={{ opacity: ribbonOpacity, zIndex: 'var(--z-chrome)' }}>
        <motion.svg viewBox="0 0 400 100" preserveAspectRatio="none" className="h-full w-full" style={{ scaleY: ribbonScale, originY: 0 }}>
          <defs>
            <linearGradient id="ptr" x1="0" x2="1">
              <stop offset="0" stopColor="var(--c-emerald)" />
              <stop offset="0.5" stopColor="var(--c-teal)" />
              <stop offset="1" stopColor="var(--c-violet)" />
            </linearGradient>
            <filter id="ptr-glow">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <motion.path
            d="M0,40 C80,70 140,10 200,40 S320,70 400,35 L400,0 L0,0 Z"
            fill="url(#ptr)"
            opacity={0.55}
            filter="url(#ptr-glow)"
            animate={busy && !reduced ? { d: ['M0,40 C80,70 140,10 200,40 S320,70 400,35 L400,0 L0,0 Z', 'M0,35 C90,10 150,70 210,35 S330,10 400,45 L400,0 L0,0 Z'] } : undefined}
            transition={{ duration: 1.2, repeat: Infinity, repeatType: 'mirror' }}
          />
        </motion.svg>
      </motion.div>
      <motion.div style={{ y: useTransform(pull, (v) => v * 0.6) }}>{children}</motion.div>
      <span className="sr-only" role="status">{busy ? 'Refreshing' : ''}</span>
    </div>
  );
}
