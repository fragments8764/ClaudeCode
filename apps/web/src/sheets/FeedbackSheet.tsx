import { eveningOf } from '@nordurljos/core';
import { Check, MessageCircleQuestion } from 'lucide-react';
import { useState } from 'react';
import { postOrQueue } from '../lib/outbox';
import { haptic } from '../lib/haptics';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

/** Local record of each night's peak score, for the "Did you see it?" loop (device only). */
const KEY = 'nl-nights';
export interface NightRec {
  peak: number;
  lat: number;
  lon: number;
  label: string;
  answered?: boolean;
}
export function readNights(): Record<string, NightRec> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function recordNight(score: number, loc: { lat: number; lon: number; label: string }, now = new Date()) {
  const n = readNights();
  const k = eveningOf(now.toISOString());
  const prev = n[k];
  if (prev && prev.peak >= score) return;
  n[k] = { peak: score, lat: loc.lat, lon: loc.lon, label: loc.label, answered: prev?.answered };
  const keys = Object.keys(n).sort().slice(-21);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keys.map((x) => [x, n[x]]))));
  } catch {
    /* ignore */
  }
}
function markAnswered(night: string) {
  const n = readNights();
  n[night] = { ...(n[night] ?? { peak: 0, lat: 0, lon: 0, label: '' }), answered: true };
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* ignore */
  }
}
/** Last night, if there was a real chance and we haven't asked yet. */
export function pendingFeedback(now = new Date()): { night: string; rec: NightRec } | null {
  const h = now.getHours();
  if (h < 6 || h >= 15) return null;
  const night = eveningOf(new Date(now.getTime() - 10 * 3.6e6).toISOString());
  const rec = readNights()[night];
  return rec && !rec.answered && rec.peak >= 10 ? { night, rec } : null;
}

/** One tap from the Tonight card (beta): records the answer, queued if offline. */
export async function answerNight(night: string, saw: boolean, fallback: { lat: number; lon: number }, brightness?: number) {
  const rec = readNights()[night];
  const at = rec ?? fallback;
  markAnswered(night);
  await postOrQueue('/api/outcomes', { night, lat: at.lat, lon: at.lon, saw, brightness, predicted: rec?.peak }).catch(() => {});
}

export function FeedbackSheet({ night, open, onClose }: { night: string | null; open: boolean; onClose: () => void }) {
  const location = useSettings((s) => s.location);
  const [state, setState] = useState<'ask' | 'done'>('ask');
  const rec = night ? readNights()[night] : undefined;
  const send = async (saw: boolean, brightness?: number) => {
    if (!night) return;
    haptic('success');
    const at = rec ?? location;
    await postOrQueue('/api/outcomes', { night, lat: at.lat, lon: at.lon, saw, brightness, predicted: rec?.peak }).catch(() => {});
    markAnswered(night);
    setState('done');
  };
  const label = night ? new Date(`${night}T12:00:00`).toLocaleDateString([], { weekday: 'long' }) : '';
  return (
    <Sheet
      open={open}
      onClose={() => {
        setState('ask');
        onClose();
      }}
      title="Did you see it?"
      initial="half"
      detents={['half', 'full']}
      header={<StatHeader id="feedback" icon={MessageCircleQuestion} label={`${label} night${rec ? ` · score peaked at ${rec.peak}` : ''}`} value="Did you see aurora?" />}
    >
      {state === 'done' ? (
        <div className="py-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[rgb(var(--aurora-rgb)/0.25)]">
            <Check size={24} strokeWidth={1.75} aria-hidden />
          </div>
          <p className="mt-3 text-[15px] text-ink-2">Thank you. Every answer helps calibrate the score for everyone.</p>
        </div>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-ink-2">
            One tap tells us whether last night's forecast{rec ? ` near ${rec.label}` : ''} was right. We store only the answer, the night and a ~10 km area; nothing identifies you.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Press variant="accent" className="h-14 text-[16px]" onClick={() => send(true, 3)}>
              Yes, I saw it
            </Press>
            <Press className="h-14 text-[16px]" onClick={() => send(false)}>
              No
            </Press>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Press className="h-12 text-[14px]" onClick={() => send(true, 5)}>
              Yes, it was bright!
            </Press>
            <Press className="h-12 text-[14px]" onClick={onClose}>
              Didn't go out
            </Press>
          </div>
        </>
      )}
    </Sheet>
  );
}
