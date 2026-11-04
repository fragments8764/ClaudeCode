import { ImagePlus, MessageSquareText, X } from 'lucide-react';
import { useState } from 'react';
import { thumbnail } from '../lib/idb';
import { postOrQueue } from '../lib/outbox';
import { APP_VERSION } from '../lib/update';
import { Press } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const device = () => {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : 'other';
  const br = /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'other';
  const standalone = matchMedia('(display-mode: standalone)').matches ? ' app' : ' browser';
  return `${os} ${br}${standalone} ${innerWidth}x${innerHeight}`;
};

/**
 * Beta feedback with an optional screenshot. Take a screenshot with your phone's buttons,
 * then attach it here (shrunk to ≤1280 px JPEG on the phone). Sent with the app version,
 * the screen you were on and the browser family: no location, no account, no IP kept.
 */
export function BetaFeedbackSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msg, setMsg] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'queued' | 'error'>('idle');
  const [err, setErr] = useState('');

  const attach = async (f: File | undefined) => {
    if (!f) return;
    try {
      let url = await thumbnail(f, 1280, 0.75);
      if (url.length > 600_000) url = await thumbnail(f, 960, 0.65); // keep under the server's ~450 KB
      setShot(url);
    } catch {
      setErr("Couldn't read that image.");
    }
  };

  const send = async () => {
    setState('sending');
    setErr('');
    try {
      const r = await postOrQueue('/api/beta-feedback', { message: msg, screenshot: shot ?? undefined, screen: location.hash || '#/tonight', version: APP_VERSION, device: device() });
      setState(r);
      setMsg('');
      setShot(null);
    } catch (e) {
      setState('error');
      setErr((e as Error).message || 'Could not send. Try again.');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Beta feedback" initial="full" detents={['half', 'full']} header={<StatHeader id="beta" icon={MessageSquareText} label="Beta feedback" value="Tell us what broke" />}>
      {state === 'sent' || state === 'queued' ? (
        <div className="py-6 text-center">
          <p className="font-display text-2xl font-light">Thank you!</p>
          <p className="mt-2 text-[15px] text-ink-2">{state === 'queued' ? "You're offline, so it will send when you have signal." : 'It went straight to the team.'}</p>
          <Press onClick={() => setState('idle')} className="mt-5 h-12 px-6 text-[15px]">
            Send another
          </Press>
        </div>
      ) : (
        <>
          <label htmlFor="beta-msg" className="text-[15px] text-ink-2">
            What happened, or what would make it better?
          </label>
          <textarea
            id="beta-msg"
            value={msg}
            onChange={(e) => setMsg(e.target.value.slice(0, 2000))}
            rows={5}
            placeholder="e.g. The map froze when I dragged the timeline on my iPhone 12."
            className="mt-2 w-full resize-none rounded-[var(--r-md)] bg-[rgb(255_255_255/0.06)] p-3 text-[15px] outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-[rgb(var(--aurora-rgb))]"
          />
          {shot ? (
            <div className="relative mt-3 w-32">
              <img src={shot} alt="Attached screenshot" className="w-32 rounded-[var(--r-sm)]" />
              <button onClick={() => setShot(null)} aria-label="Remove screenshot" className="absolute -right-3 -top-3 grid h-11 w-11 place-items-center">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[rgb(0_0_0/0.75)]">
                  <X size={14} strokeWidth={2} aria-hidden />
                </span>
              </button>
            </div>
          ) : (
            <label className="mt-3 flex min-h-[48px] cursor-pointer items-center gap-2 rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] px-4 text-[15px]">
              <ImagePlus size={18} strokeWidth={1.5} aria-hidden /> Attach a screenshot
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => attach(e.target.files?.[0])} />
            </label>
          )}
          <p className="mt-2 text-[12px] text-ink-3">Take a screenshot with your phone's buttons first, then attach it. We also send the app version ({APP_VERSION}), this screen and your browser type. No location.</p>
          {err && <p className="mt-2 text-[13px] text-poor">{err}</p>}
          <Press variant="accent" onClick={send} disabled={msg.trim().length < 3 || state === 'sending'} className="mt-4 h-14 w-full text-[16px] font-medium">
            {state === 'sending' ? 'Sending…' : 'Send feedback'}
          </Press>
        </>
      )}
    </Sheet>
  );
}
