import { motion } from 'motion/react';
import { Activity, Aperture, BookOpen, CalendarClock, BatteryLow, CalendarDays, Car, CloudDownload, CloudSun, Compass, GraduationCap, Images, ListChecks, Monitor, Share2, ShieldAlert, Sparkles, type LucideIcon } from 'lucide-react';
import { spring, STAGGER } from '../design/tokens';
import { useT } from '../lib/i18n';
import { Sheet } from '../ui/Sheet';

export type ToolId = 'sighting' | 'planner' | 'safety' | 'photo' | 'ar' | 'journal' | 'share' | 'ambient' | 'learn' | 'health' | 'prepare' | 'outlook' | 'gaps' | 'checklist' | 'driving' | 'saver' | 'feed';

const TOOLS: { id: ToolId; icon: LucideIcon; title: string; sub: string; accent?: boolean }[] = [
  { id: 'sighting', icon: Sparkles, title: 'tool.sighting', sub: 'tool.sighting.sub', accent: true },
  { id: 'planner', icon: CalendarClock, title: 'tool.planner', sub: 'tool.planner.sub' },
  { id: 'gaps', icon: CloudSun, title: 'tool.gaps', sub: 'tool.gaps.sub' },
  { id: 'outlook', icon: CalendarDays, title: 'tool.outlook', sub: 'tool.outlook.sub' },
  { id: 'safety', icon: ShieldAlert, title: 'tool.safety', sub: 'tool.safety.sub' },
  { id: 'checklist', icon: ListChecks, title: 'tool.checklist', sub: 'tool.checklist.sub' },
  { id: 'driving', icon: Car, title: 'tool.driving', sub: 'tool.driving.sub' },
  { id: 'photo', icon: Aperture, title: 'tool.photo', sub: 'tool.photo.sub' },
  { id: 'ar', icon: Compass, title: 'tool.ar', sub: 'tool.ar.sub' },
  { id: 'journal', icon: BookOpen, title: 'tool.journal', sub: 'tool.journal.sub' },
  { id: 'feed', icon: Images, title: 'tool.feed', sub: 'tool.feed.sub' },
  { id: 'share', icon: Share2, title: 'tool.share', sub: 'tool.share.sub' },
  { id: 'ambient', icon: Monitor, title: 'tool.ambient', sub: 'tool.ambient.sub' },
  { id: 'prepare', icon: CloudDownload, title: 'tool.prepare', sub: 'tool.prepare.sub' },
  { id: 'learn', icon: GraduationCap, title: 'tool.learn', sub: 'tool.learn.sub' },
  { id: 'saver', icon: BatteryLow, title: 'tool.saver', sub: 'tool.saver.sub' },
  { id: 'health', icon: Activity, title: 'tool.health', sub: 'tool.health.sub' },
];

const GROUPS: { title: string; ids: ToolId[] }[] = [
  { title: 'tools.g.plan', ids: ['planner', 'gaps', 'outlook', 'checklist', 'prepare'] },
  { title: 'tools.g.field', ids: ['safety', 'driving', 'photo', 'ar', 'ambient', 'saver'] },
  { title: 'tools.g.more', ids: ['journal', 'feed', 'share', 'learn', 'health'] },
];

export function ToolsSheet({ open, onClose, onPick, isEnabled = () => true }: { open: boolean; onClose: () => void; onPick: (t: ToolId) => void; isEnabled?: (t: ToolId) => boolean }) {
  const t = useT();
  const byId = new Map(TOOLS.map((x) => [x.id, x]));
  const hero = TOOLS.find((x) => x.accent && isEnabled(x.id));
  const fade = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: spring } };
  return (
    <Sheet open={open} onClose={onClose} title={t('tools.title')} initial="full" detents={['half', 'full']}>
      <motion.div className="pb-8" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: STAGGER / 2 } } }}>
        {hero && (
          <motion.div variants={fade}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={spring}
              onClick={() => onPick(hero.id)}
              className="flex min-h-[84px] w-full items-center gap-4 rounded-[var(--r-lg)] bg-[rgb(var(--aurora-rgb)/0.2)] p-4 text-left shadow-[inset_0_0_0_1px_rgb(var(--aurora-rgb)/0.55),var(--glow)]"
            >
              <hero.icon size={26} strokeWidth={1.5} className="shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block font-display text-[22px] font-light leading-tight">{t(hero.title)}</span>
                <span className="block text-[13px] text-ink-2">{t(hero.sub)}</span>
              </span>
            </motion.button>
          </motion.div>
        )}
        {GROUPS.map((g) => {
          const items = g.ids.filter((id) => isEnabled(id)).map((id) => byId.get(id)!);
          if (!items.length) return null;
          return (
            <section key={g.title} className="mt-6">
              <motion.h3 variants={fade} className="mb-2 text-[11px] uppercase tracking-[0.22em] text-ink-3">
                {t(g.title)}
              </motion.h3>
              <ul className="grid auto-rows-fr grid-cols-2 gap-2.5">
                {items.map(({ id, icon: Icon, title, sub }) => (
                  <motion.li key={id} variants={fade}>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      onClick={() => onPick(id)}
                      className="flex h-full min-h-[96px] w-full flex-col items-start gap-2 rounded-[var(--r-lg)] bg-[rgb(255_255_255/0.06)] p-3.5 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]"
                    >
                      <Icon size={20} strokeWidth={1.5} className="shrink-0 text-ink-2" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium leading-snug [hyphens:auto]">{t(title)}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-ink-3">{t(sub)}</span>
                      </span>
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
            </section>
          );
        })}
      </motion.div>
    </Sheet>
  );
}
