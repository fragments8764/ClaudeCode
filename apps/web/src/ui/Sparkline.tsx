import { motion } from 'motion/react';
import { useId } from 'react';
import { useReducedMotionPref } from '../lib/store';

/**
 * Sparkline with soft gradient fill, path draw-in, and a glowing current-value dot.
 * `zero` draws a reference line (e.g. Bz = 0); `fillBelowZero` highlights negative values.
 */
export function Sparkline({
  values,
  height = 64,
  color = 'var(--c-teal)',
  zero,
  min,
  max,
  label,
}: {
  values: (number | null)[];
  height?: number;
  color?: string;
  zero?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  const reduced = useReducedMotionPref();
  const id = useId().replace(/:/g, '');
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return <div className="skeleton" style={{ height }} aria-label={`${label}: no data`} />;
  const W = 320;
  const H = height;
  const vs = pts.map((p) => p[1]);
  let lo = min ?? Math.min(...vs, zero ?? Infinity);
  let hi = max ?? Math.max(...vs, zero ?? -Infinity);
  if (hi - lo < 1e-6) {
    hi += 1;
    lo -= 1;
  }
  const pad = 6;
  const x = (i: number) => (i / (values.length - 1)) * (W - pad * 2) + pad;
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const baseY = zero !== undefined ? y(zero) : H;
  const area = `${d} L${x(pts[pts.length - 1]![0]).toFixed(1)},${baseY} L${x(pts[0]![0]).toFixed(1)},${baseY} Z`;
  const [li, lv] = pts[pts.length - 1]!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: H }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`f-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zero !== undefined && <line x1={0} x2={W} y1={baseY} y2={baseY} stroke="rgb(255 255 255 / 0.14)" strokeDasharray="3 5" />}
      <motion.path d={area} fill={`url(#f-${id})`} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      <circle cx={x(li)} cy={y(lv)} r={9} fill={color} opacity={0.22} />
      <circle cx={x(li)} cy={y(lv)} r={3.5} fill={color} />
    </svg>
  );
}
