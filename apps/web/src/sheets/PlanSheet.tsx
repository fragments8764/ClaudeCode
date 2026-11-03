import { Check, MapPin, Share2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hhmm } from '../lib/format';
import { haptic } from '../lib/haptics';
import { activePlan, cancelPlan, checkIn, createPlan, onPlanChange, planUrl, type ActivePlan } from '../lib/plan';
import { shareText } from '../lib/share';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Section, Segmented, Toggle } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

export function useActivePlan() {
  const [p, setP] = useState<ActivePlan | null>(() => activePlan());
  useEffect(() => {
    const off = onPlanChange(() => setP(activePlan()));
    return () => void off();
  }, []);
  return p;
}

/** "Share my plan": destination, return time, opt-in live location; then "I'm back safe". */
export function PlanSheet({
  open,
  onClose,
  destination,
  suggestedReturn,
}: {
  open: boolean;
  onClose: () => void;
  destination: { name: string; lat: number; lon: number } | null;
  suggestedReturn: string | null;
}) {
  const location = useSettings((s) => s.location);
  const plan = useActivePlan();
  const [name, setName] = useState('');
  const [shareLoc, setShareLoc] = useState(false);
  const base = suggestedReturn ? new Date(suggestedReturn) : new Date(Date.now() + 4 * 3.6e6);
  const [extra, setExtra] = useState('0');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dest = destination ?? { name: `Near ${location.label}`, lat: location.lat, lon: location.lon };
  const returnBy = new Date(Math.ceil((base.getTime() + Number(extra) * 3.6e6) / (15 * 60_000)) * 15 * 60_000).toISOString();

  const send = async (p: ActivePlan) => {
    const r = await shareText(
      'My aurora plan',
      `${name ? `${name} is` : "I'm"} going aurora hunting at ${p.destination.name} and plans to be back by ${hhmm(p.returnBy)}.` +
        `${p.shareLocation ? ' Live location is on.' : ''} Plan & check-in status: ${planUrl(p.id)} · If I'm not back and you can't reach me, call 112.`,
    );
    setMsg(r === 'copied' ? 'Link copied, so paste it to a friend.' : r === 'shared' ? 'Plan shared.' : '');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Share my plan" initial="full" detents={['half', 'full']} header={<StatHeader id="plan" icon={ShieldCheck} label="Tell someone" value={plan ? `Back by ${hhmm(plan.returnBy)}` : 'Share my plan'} />}>
      {plan ? (
        <>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Your plan to <span className="text-ink">{plan.destination.name}</span> is shared. {plan.shareLocation ? 'Your location updates every few minutes while the app is open.' : 'Location sharing is off.'}
          </p>
          <Press
            variant="accent"
            hapticKind="success"
            disabled={busy}
            className="mt-4 h-16 w-full text-[18px]"
            onClick={async () => {
              setBusy(true);
              await checkIn().catch(() => setMsg('Couldn’t reach the server; try again when you have signal.'));
              setBusy(false);
            }}
          >
            <Check size={20} strokeWidth={2} aria-hidden /> I'm back safe
          </Press>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Press className="h-12 text-[14px]" onClick={() => send(plan)}>
              <Share2 size={15} strokeWidth={1.75} aria-hidden /> Share again
            </Press>
            <Press className="h-12 text-[14px]" onClick={() => cancelPlan()}>
              Cancel plan
            </Press>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-[var(--r-md)] bg-[rgb(255_255_255/0.05)] p-4">
            <MapPin size={18} strokeWidth={1.5} className="text-ink-2" aria-hidden />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-ink-3">Destination</div>
              <div className="truncate text-[16px] font-medium">{dest.name}</div>
            </div>
          </div>
          <Segmented
            label={`Back by ${hhmm(returnBy)}`}
            value={extra}
            options={[
              { value: '0', label: hhmm(new Date(Math.ceil(base.getTime() / 9e5) * 9e5).toISOString()) },
              { value: '1', label: '+1 h' },
              { value: '2', label: '+2 h' },
              { value: '3', label: '+3 h' },
            ]}
            onChange={setExtra}
          />
          <label className="mt-2 block text-[15px] font-medium" htmlFor="plan-name">
            Your first name <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id="plan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="given-name"
            className="mt-1 h-12 w-full rounded-[var(--r-md)] bg-[rgb(255_255_255/0.07)] px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--aurora-rgb))]"
          />
          <Section title="Privacy">
            <Toggle label="Share my live location" hint="Off by default. Updates every 5 min while the app is open, visible only to people with the link, and deleted 36 h after your return time." checked={shareLoc} onChange={setShareLoc} />
          </Section>
          <Press
            variant="accent"
            hapticKind="select"
            disabled={busy}
            className="mt-4 h-14 w-full text-[16px]"
            onClick={async () => {
              setBusy(true);
              setMsg('');
              try {
                const p = await createPlan({ name, destination: dest, returnBy, shareLocation: shareLoc });
                haptic('success');
                await send(p);
              } catch (e) {
                setMsg(`Couldn’t create the plan: ${(e as Error).message}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Share2 size={17} strokeWidth={1.75} aria-hidden /> Share my plan
          </Press>
        </>
      )}
      {msg && <p className="mt-3 text-[14px] text-ink-2" role="status">{msg}</p>}
      <p className="mt-5 pb-8 text-[12px] leading-relaxed text-ink-3">
        You'll get an "Are you back safe?" reminder 15 min after your return time (with notifications on). For longer trips, also leave a travel plan with{' '}
        <a href="https://safetravel.is/" target="_blank" rel="noreferrer" className="underline">SafeTravel.is</a>. Emergency: <a href="tel:112" className="underline">112</a>.
      </p>
    </Sheet>
  );
}
