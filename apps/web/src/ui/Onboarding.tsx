import { AnimatePresence, motion } from 'motion/react';
import { Bell, LocateFixed, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { spring } from '../design/tokens';
import { useGeolocation } from '../hooks/useGeolocation';
import { useT } from '../lib/i18n';
import { enablePush, pushSupport } from '../lib/push';
import { useSettings } from '../lib/store';
import { Press } from './Button';
import { Glass } from './Glass';

/** Three glass cards: what we do → location → notifications. The sky brightens as you go. */
export function Onboarding({ step, setStep, onDone }: { step: number; setStep: (n: number) => void; onDone: () => void }) {
  const t = useT();
  const { locate, status } = useGeolocation();
  const set = useSettings((s) => s.set);
  const [msg, setMsg] = useState('');
  const cards = [
    { icon: Sparkles, title: t('onb.1.title'), body: t('onb.1.body'), cta: t('onb.next'), act: () => setStep(1) },
    {
      icon: LocateFixed,
      title: t('onb.2.title'),
      body: t('onb.2.body'),
      cta: status === 'locating' ? t('loc.finding') : t('loc.use'),
      act: () => {
        locate();
        setTimeout(() => setStep(2), 600);
      },
    },
    {
      icon: Bell,
      title: t('onb.3.title'),
      body: pushSupport() === 'needs-install' ? t('onb.3.ios') : t('onb.3.body'),
      cta: t('onb.3.cta'),
      act: async () => {
        try {
          if (pushSupport() === 'ok') await enablePush();
        } catch (e) {
          setMsg((e as Error).message);
        }
        finish();
      },
    },
  ];
  const finish = () => {
    set('onboarded', true);
    onDone();
  };
  const c = cards[step]!;
  const Icon = c.icon;
  return (
    <div className="fixed inset-0 flex items-end justify-center px-5 pb-[max(28px,env(safe-area-inset-bottom))]" style={{ zIndex: 'var(--z-sheet)' }} role="dialog" aria-modal="true" aria-label="Welcome">
      <AnimatePresence mode="wait">
        <motion.div key={step} className="w-full max-w-md" initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -30, scale: 0.97 }} transition={spring}>
          <Glass radius="xl" refract className="px-7 pb-7 pt-8">
            <Icon size={30} strokeWidth={1.25} className="text-ink-2" aria-hidden />
            <h1 className="mt-4 font-display text-[32px] font-light leading-tight">{c.title}</h1>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{c.body}</p>
            {msg && <p className="mt-2 text-[13px] text-fair">{msg}</p>}
            <Press variant="accent" hapticKind="select" onClick={c.act} className="mt-6 h-14 w-full text-[16px] font-medium">
              {c.cta}
            </Press>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-1.5 rounded-full bg-ink" animate={{ width: i === step ? 22 : 6, opacity: i === step ? 0.9 : 0.3 }} transition={spring} />
                ))}
              </div>
              <button onClick={step < 2 ? () => setStep(step + 1) : finish} className="min-h-[44px] px-2 text-[14px] text-ink-2">
                {t('onb.skip')}
              </button>
            </div>
          </Glass>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
