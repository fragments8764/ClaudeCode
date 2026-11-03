import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { spring } from '../design/tokens';
import { Press } from './Button';

/** Small glass stat; `layoutId` lets it morph into the header of the sheet it opens. */
export function StatPill({ id, icon: Icon, label, value, tone, onOpen }: { id: string; icon: LucideIcon; label: string; value: string; tone?: string; onOpen: () => void }) {
  return (
    <Press onClick={onOpen} radius="pill" className="flex-1 px-3 py-2.5" aria-label={`${label}: ${value}. Show details`}>
      <motion.span layoutId={`stat-${id}`} transition={spring} className="flex items-center gap-2">
        <Icon size={16} strokeWidth={1.5} className="text-ink-2" aria-hidden />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[10.5px] uppercase tracking-wider text-ink-3">{label}</span>
          <span className={`text-[15px] font-medium tabular-nums ${tone ?? 'text-ink'}`}>{value}</span>
        </span>
      </motion.span>
    </Press>
  );
}

/** Header used inside a sheet, sharing the pill's layoutId. */
export function StatHeader({ id, icon: Icon, label, value, tone }: { id: string; icon: LucideIcon; label: string; value: string; tone?: string }) {
  return (
    <motion.div layoutId={`stat-${id}`} transition={spring} className="flex items-center gap-3" role="heading" aria-level={2}>
      <Icon size={22} strokeWidth={1.5} className="text-ink-2" aria-hidden />
      <div className="leading-tight">
        <div className="text-[11px] uppercase tracking-wider text-ink-3">{label}</div>
        <div className={`font-display text-2xl font-light tabular-nums ${tone ?? ''}`}>{value}</div>
      </div>
    </motion.div>
  );
}
