import { compassLabel, predictArc } from '@nordurljos/core';
import { motion } from 'motion/react';
import { Camera, Compass, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOvationGrid } from '../lib/api';
import type { Conditions } from '../lib/conditions';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Glass } from '../ui/Glass';

type DOE = DeviceOrientationEvent & { webkitCompassHeading?: number };
type IOSDOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * AR sky compass: rear camera + device heading/pitch. Shows north, where the aurora arc
 * should sit (bearing + elevation from OVATION), and the moon. Falls back to a plain
 * compass card without a camera or sensors.
 */
export function ArCompass({ c, open, onClose }: { c: Conditions; open: boolean; onClose: () => void }) {
  const location = useSettings((s) => s.location);
  const ov = useOvationGrid();
  const video = useRef<HTMLVideoElement>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [pitch, setPitch] = useState(0); // degrees above horizon the camera points at
  const [cam, setCam] = useState<'off' | 'on' | 'denied'>('off');
  const [needsPerm, setNeedsPerm] = useState(false);

  const arc = useMemo(() => {
    const o = ov.data?.data;
    if (!o) return null;
    const pts: [number, number, number][] = [];
    for (let lat = Math.max(o.latMin, Math.floor(location.lat) - 12); lat <= Math.min(o.latMax, Math.floor(location.lat) + 12); lat++) {
      for (let d = -40; d <= 40; d++) {
        const lon = Math.round(location.lon) + d;
        const lon360 = ((lon % 360) + 360) % 360;
        pts.push([lat, lon, o.values[(lat - o.latMin) * 360 + lon360] ?? 0]);
      }
    }
    return predictArc(location, pts, 10);
  }, [ov.data, location]);

  const moon = c.plan.moon;

  useEffect(() => {
    if (!open) return;
    const onO = (e: DOE) => {
      const h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? (360 - e.alpha) % 360 : null);
      if (h != null) setHeading(h);
      if (e.beta != null) setPitch(Math.max(-30, Math.min(90, e.beta - 90)));
    };
    const D = window.DeviceOrientationEvent as IOSDOE | undefined;
    setNeedsPerm(!!D?.requestPermission);
    window.addEventListener('deviceorientationabsolute', onO as EventListener);
    window.addEventListener('deviceorientation', onO as EventListener);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onO as EventListener);
      window.removeEventListener('deviceorientation', onO as EventListener);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        setCam('on');
      })
      .catch(() => setCam('denied'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [open]);

  if (!open) return null;
  const H = heading ?? 0;
  const FOV = 60; // degrees across the screen
  const xFor = (bearing: number) => {
    const d = ((bearing - H + 540) % 360) - 180;
    return 50 + (d / FOV) * 100; // % of width
  };
  const yFor = (elev: number) => 50 - ((elev - pitch) / 45) * 50; // % of height
  const arcBearing = arc?.bearingDeg ?? 0;
  const arcEl = arc?.elevationDeg ?? 10;
  const ticks = Array.from({ length: 24 }, (_, i) => i * 15);

  return createPortal(
    <div className="fixed inset-0 bg-black" style={{ zIndex: 'var(--z-sheet)' }} role="dialog" aria-modal="true" aria-label="AR sky compass">
      {cam === 'on' && <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-80" />}
      {/* compass ribbon */}
      <div className="absolute inset-x-0 top-[max(16px,env(safe-area-inset-top))] h-10 overflow-hidden" aria-hidden>
        {ticks.map((t) => {
          const x = xFor(t);
          if (x < -5 || x > 105) return null;
          return (
            <div key={t} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${x}%` }}>
              <div className={`mx-auto w-px ${t % 90 === 0 ? 'h-4 bg-ink' : 'h-2 bg-ink-3'}`} />
              <div className={`text-[11px] ${t === 0 ? 'font-semibold text-poor' : 'text-ink-2'}`}>{t % 45 === 0 ? compassLabel(t) : ''}</div>
            </div>
          );
        })}
      </div>
      {/* aurora arc band */}
      {arc && (
        <motion.div
          className="absolute h-24 w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{ left: `${xFor(arcBearing)}%`, top: `${yFor(arcEl)}%`, background: 'radial-gradient(ellipse at 50% 60%, rgb(var(--aurora-rgb) / 0.55), transparent 70%)', boxShadow: '0 0 60px rgb(var(--aurora-rgb) / 0.4)' }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 3, repeat: Infinity }}
          aria-hidden
        />
      )}
      {/* moon */}
      {moon.altitudeDeg > -2 && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${xFor(moon.bearingDeg)}%`, top: `${yFor(moon.altitudeDeg)}%` }} aria-hidden>
          <div className="mx-auto h-6 w-6 rounded-full bg-[rgb(226_232_240)] shadow-[0_0_20px_rgb(226_232_240/0.7)]" />
          <div className="mt-1 text-[11px] text-ink-2">Moon</div>
        </div>
      )}
      {/* horizon */}
      <div className="absolute inset-x-0 h-px bg-[rgb(255_255_255/0.35)]" style={{ top: `${yFor(0)}%` }} aria-hidden />
      <div className="absolute left-3 text-[11px] text-ink-3" style={{ top: `calc(${yFor(0)}% + 4px)` }} aria-hidden>
        horizon
      </div>

      {/* info card */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <Glass radius="xl" className="p-5">
          <div className="flex items-start gap-3">
            <Compass size={22} strokeWidth={1.5} className="mt-1 shrink-0 text-ink-2" aria-hidden />
            <div className="flex-1">
              <div className="font-display text-xl font-light">
                {arc
                  ? arc.overhead
                    ? 'Aurora oval is overhead: look up'
                    : arc.elevationDeg < 2
                      ? `Below your horizon now: oval is ${compassLabel(arc.bearingDeg)}`
                      : `Look ${compassLabel(arc.bearingDeg)}, about ${Math.round(arc.elevationDeg)}° up`
                  : 'Finding the aurora oval…'}
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">
                {arc && !arc.overhead ? `The nearest active part of the oval is ~${arc.distanceKm} km away (bearing ${Math.round(arc.bearingDeg)}°). ` : ''}
                {heading == null ? 'Move your phone in a figure-8 to calibrate the compass. ' : `You're facing ${compassLabel(H)} (${Math.round(H)}°). `}
                Moon {moon.altitudeDeg > 0 ? `${compassLabel(moon.bearingDeg)}, ${Math.round(moon.altitudeDeg)}° up` : 'below the horizon'}. Magnetic vs true north differs ~12° in Iceland; this compass uses true north where your phone provides it.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {needsPerm && heading == null && (
              <Press
                className="h-12 flex-1 text-[14px]"
                onClick={() => (window.DeviceOrientationEvent as IOSDOE).requestPermission?.().catch(() => {})}
              >
                <Compass size={16} strokeWidth={1.75} aria-hidden /> Compass
              </Press>
            )}
            {cam === 'denied' && (
              <span className="flex flex-1 items-center gap-1 text-[12px] text-ink-3">
                <Camera size={14} strokeWidth={1.5} aria-hidden /> Camera unavailable, so this is compass only.
              </span>
            )}
            <Press onClick={onClose} className="h-12 px-6" aria-label="Close AR compass">
              <X size={16} strokeWidth={1.75} aria-hidden /> Close
            </Press>
          </div>
        </Glass>
      </div>
    </div>,
    document.body,
  );
}

