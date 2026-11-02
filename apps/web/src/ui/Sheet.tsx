import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { spring } from '../design/tokens';
import { haptic } from '../lib/haptics';
import { useReducedMotionPref } from '../lib/store';

export type Detent = 'peek' | 'half' | 'full';

/** Visible height fraction of the viewport for each detent. */
const DETENTS: Record<Detent, number> = { peek: 0.32, half: 0.55, full: 0.92 };

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Header slot that can share a layoutId with the element that opened the sheet. */
  header?: ReactNode;
  children: ReactNode;
  initial?: Detent;
  detents?: Detent[];
  label?: string;
}

/**
 * Draggable bottom sheet: peek / half / full with spring physics and rubber-banding.
 * Drag the handle/header; content scrolls normally. Flick down or drag past peek to dismiss.
 */
export function Sheet({ open, onClose, title, header, children, initial = 'half', detents = ['half', 'full'], label }: SheetProps) {
  const [vh, setVh] = useState(() => window.innerHeight);
  const reduced = useReducedMotionPref();
  const controls = useDragControls();
  const y = useMotionValue(vh);
  const [detent, setDetent] = useState<Detent>(initial);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdrop = useTransform(y, [vh * (1 - DETENTS.full), vh], [0.55, 0]);

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const yFor = (d: Detent) => vh * (1 - DETENTS[d]);
  const go = (d: Detent) => {
    setDetent(d);
    animate(y, yFor(d), reduced ? { duration: 0.15 } : spring);
  };

  useEffect(() => {
    if (open) {
      setDetent(initial);
      y.set(vh);
      animate(y, yFor(initial), reduced ? { duration: 0.15 } : spring);
      requestAnimationFrame(() => panelRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const cur = y.get();
    const projected = cur + info.velocity.y * 0.18;
    const closeAt = vh * (1 - DETENTS.peek * 0.6);
    if (projected > closeAt || info.velocity.y > 1100) {
      onClose();
      return;
    }
    const best = detents.reduce((a, b) => (Math.abs(yFor(b) - projected) < Math.abs(yFor(a) - projected) ? b : a));
    if (best !== detent) haptic('tick');
    go(best);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: 'var(--z-sheet)' }}>
          <motion.div className="absolute inset-0 bg-black" style={{ opacity: backdrop }} onClick={onClose} aria-hidden exit={{ opacity: 0 }} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label ?? (typeof title === 'string' ? title : undefined)}
            tabIndex={-1}
            className="glass glass-strong absolute inset-x-0 top-0 mx-auto flex max-w-xl flex-col outline-none"
            style={{ y, height: vh, borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: yFor('full'), bottom: vh }}
            dragElastic={{ top: 0.08, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={onDragEnd}
            exit={{ y: vh, transition: reduced ? { duration: 0.15 } : spring }}
          >
            <div className="cursor-grab touch-none select-none px-6 pb-2 pt-3 active:cursor-grabbing" onPointerDown={(e) => controls.start(e)}>
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[rgb(255_255_255/0.28)]" aria-hidden />
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">{header ?? <h2 className="font-display text-xl font-medium">{title}</h2>}</div>
                <button onClick={onClose} aria-label="Close" className="glass grid h-11 w-11 shrink-0 place-items-center rounded-full">
                  <X size={18} strokeWidth={1.5} aria-hidden />
                </button>
              </div>
              <button className="sr-only" onClick={() => go(detent === 'full' ? 'half' : 'full')}>
                {detent === 'full' ? 'Collapse sheet' : 'Expand sheet'}
              </button>
            </div>
            <div
              className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]"
              style={{ maxHeight: `calc(${DETENTS[detent] * 100}vh - 84px)` }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
