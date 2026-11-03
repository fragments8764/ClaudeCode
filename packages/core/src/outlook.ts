import { darknessFactor, moonState, sunAltitudeDeg } from './astro';
import { effectiveCloud } from './parse/clouds';
import { bestWindow, computeScore, WEIGHTS, type Weights } from './score';
import { moonImpact } from './gaps';
import type { CloudLayers, KpPoint } from './types';

/**
 * 5-NIGHT OUTLOOK. Cloud from a 6-day hourly forecast; Kp from NOAA's 3-day forecast where it
 * exists, then the 27-day outlook's daily "largest Kp" for nights 4–5 (coarser → lower confidence).
 */
export interface DailyKp {
  date: string; // YYYY-MM-DD
  kp: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** NOAA 27-day outlook text → daily max Kp. Lines look like "2026 Nov 03     100           5          2". */
export function parse27Day(text: string): DailyKp[] {
  const out: DailyKp[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+\d+\s+\d+\s+(\d+(?:\.\d+)?)\s*$/);
    if (!m) continue;
    const mon = MONTHS.indexOf(m[2]!);
    if (mon < 0) continue;
    out.push({ date: `${m[1]}-${String(mon + 1).padStart(2, '0')}-${m[3]!.padStart(2, '0')}`, kp: Number(m[4]) });
  }
  return out;
}

export interface NightOutlook {
  /** evening date (local-ish, UTC in Iceland) */
  date: string;
  score: number;
  window: { start: string; end: string } | null;
  meanCloud: number | null;
  /** hourly effective cloud through the dark hours (for a sparkline) */
  cloudTrend: (number | null)[];
  moon: { impact: number; illumination: number; label: 'none' | 'low' | 'moderate' | 'high' };
  kpMax: number | null;
  kpSource: '3-day' | '27-day' | 'none';
  darkHours: number;
  best: boolean;
}

export function fiveNightOutlook(o: {
  lat: number;
  lon: number;
  now: Date;
  hourly: CloudLayers[];
  kp3day: KpPoint[];
  kp27: DailyKp[];
  nights?: number;
  weights?: Weights;
  minDark?: number;
}): NightOutlook[] {
  const W = o.weights ?? WEIGHTS;
  const nights = o.nights ?? 5;
  const minDark = o.minDark ?? 0.2;
  const lastKp3 = o.kp3day.length ? o.kp3day[o.kp3day.length - 1]!.time : '';
  const kpFor = (t: Date): { kp: number | null; src: NightOutlook['kpSource'] } => {
    const iso = t.toISOString();
    if (o.kp3day.length && iso <= new Date(Date.parse(lastKp3) + 3 * 3.6e6).toISOString()) {
      let v: number | null = null;
      for (const p of o.kp3day) if (p.time <= iso) v = p.kp;
      if (v != null) return { kp: v, src: '3-day' };
    }
    const d = o.kp27.find((x) => x.date === iso.slice(0, 10));
    return d ? { kp: d.kp, src: '27-day' } : { kp: null, src: 'none' };
  };
  const byHour = new Map(o.hourly.map((h) => [h.time.slice(0, 13), h]));
  const out: NightOutlook[] = [];
  const firstEvening = new Date(Date.UTC(o.now.getUTCFullYear(), o.now.getUTCMonth(), o.now.getUTCDate() - (o.now.getUTCHours() < 12 ? 1 : 0)));
  for (let n = 0; n < nights; n++) {
    const evening = new Date(firstEvening.getTime() + n * 864e5);
    const date = evening.toISOString().slice(0, 10);
    const hours: { time: string; score: number; cloud: number | null; kp: number | null; dark: number }[] = [];
    const trend: (number | null)[] = [];
    let kpMax: number | null = null;
    let src: NightOutlook['kpSource'] = 'none';
    for (let h = 15; h <= 33; h++) {
      const t = new Date(evening.getTime() + h * 3.6e6);
      if (t.getTime() < o.now.getTime() - 3.6e6) continue;
      const dark = darknessFactor(sunAltitudeDeg(t, o.lat, o.lon));
      if (dark < minDark) continue;
      const c = byHour.get(t.toISOString().slice(0, 13));
      const cloud = c ? effectiveCloud(c) : null;
      const k = kpFor(t);
      if (k.kp != null) kpMax = Math.max(kpMax ?? 0, k.kp);
      if (k.src !== 'none') src = src === '27-day' || k.src === '27-day' ? '27-day' : '3-day';
      const m = moonState(t, o.lat, o.lon);
      const r = computeScore({ sunAltDeg: sunAltitudeDeg(t, o.lat, o.lon), moonAltDeg: m.altitudeDeg, moonIllumination: m.illumination, cloud, ovation: null, kp: k.kp, bz: null, speed: null }, W);
      hours.push({ time: t.toISOString(), score: r.score, cloud, kp: k.kp, dark });
      trend.push(cloud == null ? null : Math.round(cloud));
    }
    const w = bestWindow(hours, 2, 1); // a night where every hour scores 0 has no "best window"
    const clouds = hours.map((h) => h.cloud).filter((x): x is number => x != null);
    const darkIso = hours.length ? [hours[0]!.time, hours[hours.length - 1]!.time] : null;
    const mi = darkIso ? moonImpact(darkIso[0]!, darkIso[1]!, o.lat, o.lon) : 0;
    const illum = moonState(new Date(evening.getTime() + 24 * 3.6e6), o.lat, o.lon).illumination;
    out.push({
      date,
      score: w?.score ?? 0,
      window: w ? { start: w.start, end: w.end } : null,
      meanCloud: clouds.length ? Math.round(clouds.reduce((a, b) => a + b, 0) / clouds.length) : null,
      cloudTrend: trend,
      moon: { impact: Math.round(mi * 100) / 100, illumination: Math.round(illum * 100) / 100, label: mi < 0.08 ? 'none' : mi < 0.25 ? 'low' : mi < 0.5 ? 'moderate' : 'high' },
      kpMax,
      kpSource: src,
      darkHours: hours.filter((h) => h.dark >= 0.65).length,
      best: false,
    });
  }
  const top = out.reduce<NightOutlook | null>((a, b) => (b.score > (a?.score ?? -1) ? b : a), null);
  if (top && top.score > 0) top.best = true;
  return out;
}
