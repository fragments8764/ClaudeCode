import { animate, motion, useMotionValue, useMotionValueEvent, useSpring, useTransform } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { rgb, scoreColor } from '../design/tokens';
import { useReducedMotionPref } from '../lib/store';

/**
 * Giant, calm score ring. Thin stroke, gradient that shifts grey → teal → green → magenta with
 * the score, slowly rotating sheen, number counts up with a spring. `null` = loading shimmer.
 */
export function ScoreRing({ score, size = 264, night = false }: { score: number | null; size?: number; night?: boolean }) {
  const reduced = useReducedMotionPref();
  const id = useId().replace(/:/g, '');
  const stroke = 5;
  const r = size / 2 - stroke * 3;
  const C = 2 * Math.PI * r;
  const target = score ?? 0;

  const progress = useSpring(0, { stiffness: 60, damping: 20 });
  const dash = useTransform(progress, (v) => `${(v / 100) * C} ${C}`);
  const count = useMotionValue(0);
  const [shown, setShown] = useState(0);
  useMotionValueEvent(count, 'change', (v) => setShown(Math.round(v)));

  useEffect(() => {
    if (score === null) return;
    if (reduced) {
      progress.jump(target);
      count.set(target);
      return;
    }
    progress.set(target);
    const a = animate(count, target, { duration: 1.4, ease: [0.16, 1, 0.3, 1] });
    return () => a.stop();
  }, [score, target, reduced, progress, count]);

  const c1 = night ? [150, 25, 25] as const : scoreColor(Math.max(0, target - 30));
  const c2 = night ? [220, 60, 60] as const : scoreColor(target);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {/* soft scrim keeps the number ≥ 4.5:1 even over a bright storm sky */}
      <div aria-hidden className="absolute inset-[12%] rounded-full" style={{ background: 'radial-gradient(circle, rgb(2 4 10 / 0.42) 0%, rgb(2 4 10 / 0.18) 55%, transparent 72%)' }} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={rgb([...c1])} />
            <stop offset="100%" stopColor={rgb([...c2])} />
            {!reduced && (
              <animateTransform attributeName="gradientTransform" type="rotate" from={`0 .5 .5`} to={`360 .5 .5`} dur="18s" repeatCount="indefinite" />
            )}
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
        {score === null ? (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(255 255 255 / 0.18)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${C * 0.18} ${C}`}
            animate={reduced ? undefined : { rotate: 360 }}
            transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }}
            style={{ originX: '50%', originY: '50%' }}
          />
        ) : (
          <>
            <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g-${id})`} strokeWidth={stroke * 3} strokeLinecap="round" style={{ strokeDasharray: dash }} filter={`url(#glow-${id})`} opacity={0.45} />
            <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#g-${id})`} strokeWidth={stroke} strokeLinecap="round" style={{ strokeDasharray: dash }} />
          </>
        )}
      </svg>
      <div className="on-sky relative text-center" role="img" aria-label={score === null ? 'Aurora score loading' : `Aurora score ${target} out of 100`}>
        {score === null ? (
          <div className="skeleton mx-auto h-16 w-28" />
        ) : (
          <div className="font-display text-[88px] font-extralight leading-none tracking-tight tabular-nums" aria-hidden>
            {shown}
          </div>
        )}
        <div className="mt-2 text-[11px] uppercase tracking-[0.28em] text-ink-2" aria-hidden>
          Aurora score
        </div>
      </div>
    </div>
  );
}
