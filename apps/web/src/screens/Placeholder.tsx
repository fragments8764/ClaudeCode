import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { spring } from '../design/tokens';
import { Glass } from '../ui/Glass';

/** Calm empty state for tabs not built yet. */
export function PlaceholderScreen({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 pb-28">
      <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>
        <Glass radius="xl" className="max-w-sm px-8 py-10 text-center">
          <Icon size={28} strokeWidth={1.25} className="mx-auto text-ink-2" aria-hidden />
          <h1 className="mt-4 font-display text-2xl font-light">{title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
        </Glass>
      </motion.div>
    </div>
  );
}
