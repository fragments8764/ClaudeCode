import { motion } from 'motion/react';
import { Aperture, BookOpen, CalendarClock, Compass, GraduationCap, Monitor, Share2, ShieldAlert, Sparkles, type LucideIcon } from 'lucide-react';
import { spring, STAGGER } from '../design/tokens';
import { useT } from '../lib/i18n';
import { Sheet } from '../ui/Sheet';

export type ToolId = 'sighting' | 'planner' | 'safety' | 'photo' | 'ar' | 'journal' | 'share' | 'ambient' | 'learn';

const TOOLS: { id: ToolId; icon: LucideIcon; title: string; sub: string; accent?: boolean }[] = [
  { id: 'sighting', icon: Sparkles, title: 'tool.sighting', sub: 'tool.sighting.sub', accent: true },
  { id: 'planner', icon: CalendarClock, title: 'tool.planner', sub: 'tool.planner.sub' },
  { id: 'safety', icon: ShieldAlert, title: 'tool.safety', sub: 'tool.safety.sub' },
  { id: 'photo', icon: Aperture, title: 'tool.photo', sub: 'tool.photo.sub' },
  { id: 'ar', icon: Compass, title: 'tool.ar', sub: 'tool.ar.sub' },
  { id: 'journal', icon: BookOpen, title: 'tool.journal', sub: 'tool.journal.sub' },
  { id: 'share', icon: Share2, title: 'tool.share', sub: 'tool.share.sub' },
  { id: 'ambient', icon: Monitor, title: 'tool.ambient', sub: 'tool.ambient.sub' },
  { id: 'learn', icon: GraduationCap, title: 'tool.learn', sub: 'tool.learn.sub' },
];

export function ToolsSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: ToolId) => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t('tools.title')} initial="full" detents={['half', 'full']}>
      <motion.ul className="grid grid-cols-2 gap-3 pb-8" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: STAGGER / 2 } } }}>
        {TOOLS.map(({ id, icon: Icon, title, sub, accent }) => (
          <motion.li key={id} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: spring } }} className={accent ? 'col-span-2' : ''}>
            <motion.button
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={() => onPick(id)}
              className={`flex min-h-[92px] w-full flex-col items-start justify-between rounded-[var(--r-lg)] p-4 text-left ${accent ? 'bg-[rgb(var(--aurora-rgb)/0.2)] shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.55),var(--glow)]' : 'bg-[rgb(255_255_255/0.06)] shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]'}`}
            >
              <Icon size={accent ? 24 : 20} strokeWidth={1.5} className={accent ? '' : 'text-ink-2'} aria-hidden />
              <span>
                <span className={`block font-medium ${accent ? 'font-display text-[22px] font-light' : 'text-[15px]'}`}>{t(title)}</span>
                <span className="block text-[12px] text-ink-3">{t(sub)}</span>
              </span>
            </motion.button>
          </motion.li>
        ))}
      </motion.ul>
    </Sheet>
  );
}
