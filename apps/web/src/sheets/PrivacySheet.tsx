import { Download, Lock, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deleteMyData, exportMyData } from '../lib/privacy';
import { shareFile } from '../lib/share';
import { useSettings } from '../lib/store';
import { Press } from '../ui/Button';
import { Section, Toggle } from '../ui/Controls';
import { Sheet } from '../ui/Sheet';
import { StatHeader } from '../ui/StatPill';

const ROWS: [string, string, string][] = [
  ['Your location', 'On this phone, approximate (~5 km) unless you choose precise', 'Server sees it rounded to ~5 km for weather; never stored with an identity'],
  ['Journal, shots, checklist, preferences', 'On this phone only', 'Never sent'],
  ['Push alerts (if on)', 'Your browser’s push address + a ~5 km area + thresholds', 'Deleted when you switch alerts off'],
  ['Community reports (if you share)', 'Rounded to ~10 km (25 km for private spots), optional photo', 'Live reports deleted after 12 h, feed photos after 7 days; delete any time'],
  ['Trip plans (if you share)', 'Destination, return time, location only if you opt in', 'Deleted 36 h after your return time'],
  ['"Did you see it?" answers', 'Yes/no + night + ~10 km area', 'Anonymous, used only to tune the score'],
  ['Analytics & crash reports', 'Off unless you turn them on below', 'Event names / error messages only, no identifiers'],
];

export function PrivacySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Privacy" initial="full" detents={['half', 'full']} header={<StatHeader id="privacy" icon={Lock} label="Privacy" value="Your data, your call" />}>
      <p className="text-[15px] leading-relaxed text-ink-2">No accounts, no ads, and we never sell data. Here is everything Norðurljós keeps, and where:</p>
      <ul className="mt-3 divide-y divide-[rgb(255_255_255/0.06)]">
        {ROWS.map(([what, where, keep]) => (
          <li key={what} className="py-2.5">
            <div className="text-[15px] font-medium">{what}</div>
            <div className="text-[13px] text-ink-2">{where}</div>
            <div className="text-[12px] text-ink-3">{keep}</div>
          </li>
        ))}
      </ul>
      <Section title="Choices">
        <Toggle label="Precise location" hint="Off: the app keeps only an approximate position. The map can still use one precise fix when you tap 'locate me', without storing it." checked={s.preciseLocation} onChange={(v) => s.set('preciseLocation', v)} />
        <Toggle label="Share anonymous usage counts" hint="Which screens and tools get used, as plain counts. No IDs, no location." checked={s.analytics} onChange={(v) => s.set('analytics', v)} />
        <Toggle label="Send crash reports" hint="Error message and app version, to help fix bugs. No personal data." checked={s.crashReports} onChange={(v) => s.set('crashReports', v)} />
      </Section>
      <Section title="Your data">
        <div className="grid grid-cols-2 gap-2 py-3">
          <Press className="h-12 text-[14px]" onClick={async () => setMsg((await shareFile(await exportMyData(), 'My Norðurljós data', 'Export')) === 'downloaded' ? 'Export downloaded.' : 'Export shared.')}>
            <Download size={15} strokeWidth={1.75} aria-hidden /> Export my data
          </Press>
          <Press className="h-12 text-[14px] text-poor" onClick={() => setConfirm(true)}>
            <Trash2 size={15} strokeWidth={1.75} aria-hidden /> Delete my data
          </Press>
        </div>
        {confirm && (
          <div className="mb-3 rounded-[var(--r-md)] bg-[rgb(251_113_133/0.12)] p-4 text-[14px]" role="alertdialog" aria-label="Confirm delete">
            This turns off alerts, deletes your community reports and photos, cancels any shared plan, and erases everything on this phone (journal, shots, settings, offline map). It can't be undone.
            <div className="mt-3 flex gap-2">
              <Press
                className="h-11 flex-1 text-[14px]"
                variant="accent"
                onClick={async () => {
                  const r = await deleteMyData();
                  setMsg(`Deleted. ${r.reports} community report(s) removed. Reloading…`);
                  setTimeout(() => location.replace('/'), 1500);
                }}
              >
                Delete everything
              </Press>
              <Press className="h-11 flex-1 text-[14px]" onClick={() => setConfirm(false)}>
                Cancel
              </Press>
            </div>
          </div>
        )}
        {msg && <p className="pb-2 text-[14px] text-good" role="status">{msg}</p>}
      </Section>
      <p className="pb-8 pt-2 text-[12px] text-ink-3">There is no account to delete. Everything server-side is either anonymous or tied to a token kept only on your phone, which "Delete my data" uses.</p>
    </Sheet>
  );
}
