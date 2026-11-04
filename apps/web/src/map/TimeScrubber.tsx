import { motion, useMotionValue, animate } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { springSnappy } from '../design/tokens';
import { whenDay } from '../lib/format';
import { haptic } from '../lib/haptics';
import { Glass } from '../ui/Glass';

/**
 * Time scrubber: past 3 h → next 48 h, magnetic snap to whole hours with a haptic tick
 * per hour crossed. Background bars show cloud at your location; shaded band = darkness.
 */
export function TimeScrubber({
  min,
  max,
  value,
  onChange,
  onScrub,
  now,
  bars,
  dark,
}: {
  min: number;
  max: number;
  value: number;
  onChange: (h: number) => void;
  /** true while a finger/mouse is dragging the thumb (lets the map skip cross-fades) */
  onScrub?: (active: boolean) => void;
  now: Date;
  /** cloud % for each hour offset from min..max (null = unknown) */
  bars: (number | null)[];
  /** darkness 0–1 for each hour offset */
  dark: number[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [playing, setPlaying] = useState(false);
  const span = max - min;
  const pos = (h: number) => (h - min) / span;

  // While dragging, the thumb follows the finger exactly; it only springs to the snapped
  // hour when the value changes some other way (play, keys, "Now") or on release.
  // (Bug fix: the spring used to fire on every hour crossed mid-drag and fight the finger.)
  const dragging = useRef(false);
  const last = useRef(value);
  last.current = dragging.current ? last.current : value;
  const snap = () => animate(x, pos(last.current) * (track.current?.clientWidth ?? 0), springSnappy);
  useEffect(() => {
    if (!dragging.current) snap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max]);
  // keep the thumb in place when the track resizes (rotation, sheet open)
  useEffect(() => {
    const el = track.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => !dragging.current && x.set(pos(last.current) * el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => onChange(value >= max ? min : value + 1), 650);
    return () => clearInterval(id);
  }, [playing, value, min, max, onChange]);

  const fromClientX = (cx: number) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (cx - r.left) / r.width));
    x.set(f * r.width); // follow the finger…
    const h = Math.round(min + f * span); // …but snap the value
    // compare with the last value we emitted, not the (possibly not yet re-rendered) prop,
    // so fast drags never send the same hour twice or double-tick the haptic
    if (h !== last.current) {
      last.current = h;
      haptic('tick');
      onChange(h);
    }
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onScrub?.(false);
    snap();
  };

  const t = new Date(Math.floor(now.getTime() / 3.6e6) * 3.6e6 + value * 3.6e6);
  const label = value === 0 ? 'Now' : whenDay(t.toISOString(), now);

  return (
    <Glass radius="xl" className="px-4 pb-3 pt-2.5">
      <div className="mb-1.5 flex items-center gap-3">
        <button
          onClick={() => {
            haptic('tap');
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pause' : 'Play forecast'}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[rgb(255_255_255/0.08)]"
        >
          {playing ? <Pause size={16} strokeWidth={1.75} aria-hidden /> : <Play size={16} strokeWidth={1.75} aria-hidden />}
        </button>
        <div className="flex-1 leading-tight">
          <div className="text-[11px] uppercase tracking-wider text-ink-3">{value < 0 ? 'Past' : value === 0 ? 'Live' : 'Forecast'}</div>
          <div className="text-[15px] font-medium tabular-nums">{label}</div>
        </div>
        {value !== 0 && (
          <button onClick={() => onChange(0)} className="min-h-10 rounded-full px-3 text-[13px] text-ink-2">
            Now
          </button>
        )}
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Map time"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={label}
        className="relative h-11 touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          dragging.current = true;
          onScrub?.(true);
          setPlaying(false);
          fromClientX(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && fromClientX(e.clientX)}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + 1));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, value - 1));
          if (e.key === 'Home') onChange(min);
          if (e.key === 'End') onChange(max);
        }}
      >
        {/* darkness band + cloud bars */}
        <div className="absolute inset-x-0 bottom-0 top-2 flex items-end gap-px overflow-hidden rounded-md">
          {bars.map((c, i) => (
            <div key={i} className="relative h-full flex-1" style={{ background: `rgb(var(--aurora-rgb) / ${0.04 + (dark[i] ?? 0) * 0.14})` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-[2px] bg-[rgb(255_255_255/0.28)]" style={{ height: `${c == null ? 0 : Math.max(4, c)}%` }} />
            </div>
          ))}
        </div>
        {/* now marker */}
        <div className="absolute bottom-0 top-1 w-px bg-[rgb(255_255_255/0.5)]" style={{ left: `${pos(0) * 100}%` }} aria-hidden />
        {/* thumb */}
        <motion.div className="pointer-events-none absolute -top-0.5 bottom-[-2px] w-1.5 -translate-x-1/2 rounded-full bg-ink shadow-[0_0_12px_rgb(var(--aurora-rgb)/0.8)]" style={{ x }} aria-hidden />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-3">
        <span>−3 h</span>
        <span>cloud here · shaded = dark</span>
        <span>+48 h</span>
      </div>
    </Glass>
  );
}
