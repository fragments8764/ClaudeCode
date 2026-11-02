import { LayoutGroup, motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { springSnappy } from '../design/tokens';
import { haptic } from '../lib/haptics';

/** iOS-style switch, 48px row target. */
export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        haptic('tap');
        onChange(!checked);
      }}
      className="flex min-h-[56px] w-full items-center gap-4 py-2 text-left disabled:opacity-40"
    >
      <span className="flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-ink-3">{hint}</span>}
      </span>
      <span className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${checked ? 'bg-[rgb(var(--aurora-rgb)/0.85)]' : 'bg-[rgb(255_255_255/0.14)]'}`}>
        <motion.span
          className="absolute top-[3px] h-6 w-6 rounded-full bg-ink shadow"
          animate={{ left: checked ? 23 : 3 }}
          transition={springSnappy}
        />
      </span>
    </button>
  );
}

/** Segmented control with a sliding glass pill. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: ReactNode; disabled?: boolean }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="py-2">
      <div className="mb-2 text-[15px] font-medium" id={id}>
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={id} className="flex rounded-full bg-[rgb(255_255_255/0.06)] p-1">
        <LayoutGroup id={id}>
          {options.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={o.value === value}
              disabled={o.disabled}
              onClick={() => {
                haptic('select');
                onChange(o.value);
              }}
              className="relative min-h-[44px] flex-1 rounded-full px-2 text-[13px] disabled:opacity-35"
            >
              {o.value === value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-[rgb(255_255_255/0.14)] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]" transition={springSnappy} />}
              <span className="relative">{o.label}</span>
            </button>
          ))}
        </LayoutGroup>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-1 text-[11px] uppercase tracking-[0.22em] text-ink-3">{title}</h3>
      <div className="divide-y divide-[rgb(255_255_255/0.06)]">{children}</div>
    </section>
  );
}
