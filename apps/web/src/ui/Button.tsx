import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { PRESS_SCALE, springSnappy } from '../design/tokens';
import { haptic } from '../lib/haptics';

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export interface PressProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  glass?: boolean;
  radius?: 'md' | 'lg' | 'pill';
  hapticKind?: 'tap' | 'select' | 'success' | false;
  variant?: 'glass' | 'accent' | 'plain';
}

/**
 * Pressable: soft press scale (0.96), glow ripple from the touch point, subtle haptic.
 * Minimum 48px target. Use `variant="accent"` for the single primary action on a screen.
 */
export function Press({ children, className = '', radius = 'pill', hapticKind = 'tap', variant = 'glass', onPointerDown, onClick, style, ...rest }: PressProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const base =
    variant === 'glass' ? 'glass' : variant === 'accent' ? 'bg-[rgb(var(--aurora-rgb))] text-[color:var(--c-base-0)] font-medium shadow-[var(--glow)]' : '';
  return (
    <motion.button
      whileTap={{ scale: PRESS_SCALE }}
      transition={springSnappy}
      className={`relative min-h-[var(--tap)] min-w-[var(--tap)] overflow-hidden ${base} ${className}`}
      style={{ borderRadius: radius === 'pill' ? 'var(--r-pill)' : radius === 'lg' ? 'var(--r-lg)' : 'var(--r-md)', ...style }}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const id = performance.now();
        setRipples((rs) => [...rs.slice(-2), { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
        onPointerDown?.(e);
      }}
      onClick={(e) => {
        if (hapticKind) haptic(hapticKind);
        onClick?.(e);
      }}
      {...rest}
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{ left: r.x - 60, top: r.y - 60, width: 120, height: 120, background: 'radial-gradient(circle, rgb(var(--aurora-rgb) / 0.35), transparent 70%)' }}
            initial={{ scale: 0.2, opacity: 0.9 }}
            animate={{ scale: 2.4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setRipples((rs) => rs.filter((x) => x.id !== r.id))}
          />
        ))}
      </AnimatePresence>
      <span className="relative flex h-full w-full items-center justify-center gap-2">{children}</span>
    </motion.button>
  );
}
