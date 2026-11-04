import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { dateLabel, hhmm } from '../lib/format';
import { haptic } from '../lib/haptics';

export interface TPoint {
  /** epoch ms */
  t: number;
  v: number | null;
}

export interface Threshold {
  v: number;
  label: string;
  color?: string;
}

/**
 * Apple-Weather-style interactive timeline: drag (or use arrow keys) to read any hour; the
 * parent shows the readout. Past is solid, forecast is lighter; "now" is a glowing dot.
 * Labels are HTML (not SVG text) so they never stretch with the chart's width.
 */
export function TimelineChart({
  points,
  now,
  color = 'var(--c-teal)',
  kind = 'line',
  min,
  max,
  thresholds = [],
  bands = [],
  height = 150,
  label,
  fmt = (v) => String(Math.round(v)),
  onSelect,
}: {
  points: TPoint[];
  now: number;
  color?: string;
  kind?: 'line' | 'bars';
  min?: number;
  max?: number;
  thresholds?: Threshold[];
  /** shaded intervals, e.g. darkness: [startMs, endMs] */
  bands?: [number, number][];
  height?: number;
  label: string;
  fmt?: (v: number) => string;
  onSelect?: (p: TPoint | null) => void;
}) {
  const id = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const lastSel = useRef<number | null>(null);
  const valid = points.filter((p): p is { t: number; v: number } => p.v != null);
  const t0 = points[0]?.t ?? now;
  const t1 = points[points.length - 1]?.t ?? now + 1;
  const vals = valid.map((p) => p.v);
  const lo = min ?? Math.min(...vals, ...thresholds.map((x) => x.v));
  const hi = max ?? Math.max(...vals, ...thresholds.map((x) => x.v));
  const span = hi - lo || 1;
  const W = 1000;
  const H = 100;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * H;

  const { past, future } = useMemo(() => {
    const seg = (pred: (t: number) => boolean) => {
      let d = '';
      let pen = false;
      for (const p of points) {
        if (p.v == null || !pred(p.t)) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    // overlap by one point so the line is continuous through "now"
    const lastPast = [...points].reverse().find((p) => p.t <= now)?.t ?? t0;
    return { past: seg((t) => t <= now), future: seg((t) => t >= lastPast) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, now, lo, hi]);

  const nearest = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const t = t0 + ((clientX - r.left) / r.width) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i]!.t - t) < Math.abs(points[best]!.t - t)) best = i;
    return best;
  };
  const choose = (i: number | null) => {
    if (i === lastSel.current) return;
    lastSel.current = i;
    if (i != null) haptic('tick');
    setSel(i);
    onSelect?.(i == null ? null : points[i]!);
  };
  useEffect(() => () => onSelect?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const nowPt = [...valid].reverse().find((p) => p.t <= now) ?? valid[0];
  const selPt = sel != null ? points[sel] : null;
  const ticks = useMemo(() => {
    const out: number[] = [];
    const step = (t1 - t0) / 3.6e6 > 30 ? 12 : 6;
    const first = Math.ceil(t0 / (step * 3.6e6)) * step * 3.6e6;
    for (let t = first; t <= t1; t += step * 3.6e6) out.push(t);
    return out;
  }, [t0, t1]);

  const multiDay = (t1 - t0) / 3.6e6 > 30;
  if (valid.length < 2) return <div className="skeleton" style={{ height }} aria-label={`${label}: no data yet`} />;
  const barW = Math.max(2, (W / points.length) * 0.7);

  return (
    <div className="select-none">
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label={`${label}. Drag or use arrow keys to read a time.`}
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={sel ?? 0}
        aria-valuetext={selPt?.v != null ? `${hhmm(new Date(selPt.t).toISOString())}: ${fmt(selPt.v)}` : nowPt ? `Now: ${fmt(nowPt.v)}` : 'no data'}
        className="relative touch-none rounded-[var(--r-sm)] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--aurora-rgb))]"
        style={{ height }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          choose(nearest(e.clientX));
        }}
        onPointerMove={(e) => lastSel.current != null && choose(nearest(e.clientX))}
        onPointerUp={() => choose(null)}
        onPointerCancel={() => choose(null)}
        onKeyDown={(e) => {
          const cur = sel ?? Math.max(0, points.findIndex((p) => p.t >= now));
          if (e.key === 'ArrowRight') choose(Math.min(points.length - 1, cur + 1));
          else if (e.key === 'ArrowLeft') choose(Math.max(0, cur - 1));
          else if (e.key === 'Escape') choose(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => choose(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`f-${id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.35" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {bands.map(([a, b], i) => (
            <rect key={i} x={x(Math.max(a, t0))} width={Math.max(0, x(Math.min(b, t1)) - x(Math.max(a, t0)))} y={0} height={H} fill="rgb(var(--aurora-rgb) / 0.08)" />
          ))}
          {thresholds.map((th) => (
            <line key={th.label} x1={0} x2={W} y1={y(th.v)} y2={y(th.v)} stroke={th.color ?? 'rgb(255 255 255 / 0.25)'} strokeDasharray="6 8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          {kind === 'bars'
            ? points.map((p, i) =>
                p.v == null ? null : (
                  <rect
                    key={i}
                    x={x(p.t) - barW / 2}
                    width={barW}
                    y={y(p.v)}
                    height={Math.max(1, H - y(p.v))}
                    rx={3}
                    fill={color}
                    opacity={sel === i ? 1 : p.t > now ? 0.4 : 0.85}
                  />
                ),
              )
            : (
              <>
                <path d={`${past}L${x(nowPt!.t)},${H}L${x(valid[0]!.t)},${H}Z`} fill={`url(#f-${id})`} />
                <path d={past} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <path d={future} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </>
            )}
          <line x1={x(now)} x2={x(now)} y1={0} y2={H} stroke="rgb(255 255 255 / 0.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {selPt && <line x1={x(selPt.t)} x2={x(selPt.t)} y1={0} y2={H} stroke="var(--c-text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* dots in HTML so they stay round at any aspect ratio */}
        {kind === 'line' && nowPt && !selPt && <Dot left={x(nowPt.t) / W} top={y(nowPt.v) / H} color={color} glow />}
        {selPt?.v != null && <Dot left={x(selPt.t) / W} top={y(selPt.v) / H} color="var(--c-text)" />}
        {thresholds.map((th) => (
          <span key={th.label} className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[10.5px] text-ink-3" style={{ top: `${(y(th.v) / H) * 100}%` }}>
            {th.label}
          </span>
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-ink-3" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${(x(t) / W) * 100}%` }}>
            {Math.abs(t - now) < 30 * 60_000 ? 'Now' : multiDay && hhmm(new Date(t).toISOString()) === '00:00' ? dateLabel(new Date(t), { weekday: 'short' }) : hhmm(new Date(t).toISOString())}
          </span>
        ))}
      </div>
    </div>
  );
}

function Dot({ left, top, color, glow }: { left: number; top: number; color: string; glow?: boolean }) {
  return (
    <span
      className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--c-base-0)]"
      style={{ left: `${left * 100}%`, top: `${top * 100}%`, background: color, boxShadow: glow ? `0 0 12px ${color}` : undefined }}
    />
  );
}
