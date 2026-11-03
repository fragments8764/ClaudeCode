import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

/** Learn tab / offline cheat sheet. Bundled with the app, so it works with no signal. */
const TOPICS: { id: string; title: string; body: string[] }[] = [
  {
    id: 'basics',
    title: 'What is the aurora?',
    body: [
      'Charged particles from the Sun (the solar wind) are funnelled by Earth’s magnetic field towards the poles. When they hit oxygen and nitrogen 100–300 km up, the gas glows.',
      'Iceland sits right under the auroral oval, the ring where aurora is most common, so even quiet nights can show an arc.',
    ],
  },
  {
    id: 'kp',
    title: 'Kp, in one minute',
    body: [
      'Kp is a 0–9 index of how disturbed Earth’s magnetic field is, measured every 3 hours. Higher means a brighter, bigger oval that reaches further south.',
      'In Iceland, Kp 2–3 is often enough on a clear, dark night; Kp 5+ (a G1 storm) can fill the sky. Kp is a global average, so local conditions matter just as much.',
    ],
  },
  {
    id: 'bz',
    title: 'Why Bz matters most',
    body: [
      'Bz is the north–south direction of the magnetic field carried by the solar wind. When it points south (negative), it links up with Earth’s field and energy pours in. Think of it as the door being open.',
      'A sustained Bz of −5 nT or lower for 30+ minutes often leads to a substorm: a sudden brightening with fast-moving curtains. That’s when to be outside.',
    ],
  },
  {
    id: 'colors',
    title: 'Colours & altitude',
    body: [
      'Green (557.7 nm, oxygen, ~100–200 km) is the classic colour and the one eyes see best.',
      'Pink/purple lower edges come from nitrogen at ~90–100 km during strong, fast displays. Red (630 nm, oxygen above ~200 km) is rarer and usually needs a big storm.',
      'Cameras see colour much better than eyes. A faint aurora often looks grey-white to the naked eye.',
    ],
  },
  {
    id: 'cycle',
    title: 'Solar cycle 25',
    body: [
      'The Sun runs on a ~11-year cycle. Cycle 25 peaked around 2024–2025, and the declining years that follow often bring strong storms from coronal holes and CMEs, so the next few winters remain excellent.',
    ],
  },
  {
    id: 'myths',
    title: 'Myths',
    body: [
      '“You need Kp 5 in Iceland.” No: clear and dark beats a high Kp under clouds.',
      '“It’s always green and dancing.” Often it’s a pale arc; patience pays off, because substorms come in bursts.',
      '“Full moon ruins it.” A bright moon hides faint aurora but lights the landscape beautifully for photos.',
    ],
  },
  {
    id: 'safety',
    title: 'Safety & etiquette',
    body: [
      'Never stop on the road or in a passing place. Park fully off the road with lights off.',
      'Respect private land and fences; don’t drive off-road (it’s illegal and damages moss for decades).',
      'Use a red light, never a white torch near other people’s cameras, and don’t leave your car’s headlights on.',
      'Check umferdin.is (roads), vedur.is (weather) and safetravel.is before driving. Emergency: 112.',
    ],
  },
  {
    id: 'cheat',
    title: 'Cheat sheet',
    body: [
      'Go if: dark (sun < −12°) + cloud < 40% + (Kp ≥ 2 or Bz south). Look north first, low on the horizon.',
      'Give your eyes 15–20 minutes of darkness, and avoid your phone’s white screen (use Night Vision).',
      'Camera start: ISO 1600, 8–10 s, widest aperture, manual focus on a star.',
    ],
  },
];

export function LearnSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>('basics');
  return (
    <Sheet open={open} onClose={onClose} title="Learn" initial="full" detents={['half', 'full']} header={<StatHeader id="learn" icon={GraduationCap} label="Learn" value="Aurora, explained" />}>
      <ul className="divide-y divide-[rgb(255_255_255/0.06)] pb-8">
        {TOPICS.map((t) => {
          const isOpen = openId === t.id;
          return (
            <li key={t.id}>
              <button aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : t.id)} className="flex min-h-[56px] w-full items-center justify-between py-2 text-left">
                <span className="text-[16px] font-medium">{t.title}</span>
                <span className="text-ink-3" aria-hidden>
                  {isOpen ? '–' : '+'}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-2 pb-4 text-[15px] leading-relaxed text-ink-2">
                  {t.body.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
