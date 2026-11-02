import { LayoutGroup, motion } from 'motion/react';
import { Camera, Map, Moon, Orbit, type LucideIcon } from 'lucide-react';
import { spring } from '../design/tokens';
import { haptic } from '../lib/haptics';
import type { Tab } from '../lib/store';
import { Glass } from './Glass';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'tonight', label: 'Tonight', icon: Moon },
  { id: 'map', label: 'Map', icon: Map },
  { id: 'cameras', label: 'Cameras', icon: Camera },
  { id: 'space', label: 'Space', icon: Orbit },
];

/** Floating glass tab bar. The active tab has a liquid pill that slides & morphs between tabs. */
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-4 pb-[max(14px,env(safe-area-inset-bottom))]"
      style={{ zIndex: 'var(--z-chrome)' }}
    >
      <Glass refract radius="pill" className="pointer-events-auto flex w-full max-w-md items-center gap-1 p-1.5" role="tablist">
        <LayoutGroup id="tabs">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                aria-label={label}
                onClick={() => {
                  if (!active) haptic('select');
                  onChange(id);
                }}
                className="relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full"
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'linear-gradient(180deg, rgb(255 255 255 / 0.16), rgb(255 255 255 / 0.06))',
                      boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.25), 0 0 20px rgb(var(--aurora-rgb) / 0.18)',
                    }}
                    transition={spring}
                  />
                )}
                <Icon size={21} strokeWidth={1.5} className={`relative transition-colors ${active ? 'text-ink' : 'text-ink-3'}`} aria-hidden />
                <span className={`relative text-[10.5px] tracking-wide transition-colors ${active ? 'text-ink' : 'text-ink-3'}`}>{label}</span>
              </button>
            );
          })}
        </LayoutGroup>
      </Glass>
    </nav>
  );
}
