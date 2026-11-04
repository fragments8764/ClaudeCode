import { accessSync, constants, mkdirSync } from 'node:fs';

export interface ConfigIssue {
  key: string;
  level: 'error' | 'warn';
  problem: string;
  fix: string;
}

/**
 * Production settings check. Run at startup (loud banner), shown on /admin, and as key
 * names (never values) in /api/health. `error` = data loss or broken features in
 * production; `warn` = works, but not the way it should for a launch.
 */
export function checkConfig(env: Record<string, string | undefined>, opts: { dataDir: string; dataDirDefaulted: boolean }): ConfigIssue[] {
  const out: ConfigIssue[] = [];
  const onRender = env.RENDER === 'true';
  const prod = onRender || env.NODE_ENV === 'production';

  if (opts.dataDirDefaulted && prod)
    out.push({ key: 'DATA_DIR', level: 'error', problem: 'DATA_DIR is not set, so sightings, plans, alert subscriptions and feedback are stored inside the app folder and wiped on every deploy.', fix: 'Add a persistent disk mounted at /data and set DATA_DIR=/data.' });
  try {
    mkdirSync(opts.dataDir, { recursive: true });
    accessSync(opts.dataDir, constants.W_OK);
  } catch {
    out.push({ key: 'DATA_DIR', level: 'error', problem: `DATA_DIR (${opts.dataDir}) is not writable.`, fix: 'Check the disk mount path matches DATA_DIR.' });
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
    out.push({ key: 'VAPID_PUBLIC_KEY', level: prod ? 'error' : 'warn', problem: 'Push keys are not fixed. New keys are generated when the data folder is empty, which silently breaks every alert subscription.', fix: 'Run `npm run vapid -w @nordurljos/server` once and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.' });
  else if (!env.VAPID_SUBJECT) out.push({ key: 'VAPID_SUBJECT', level: 'warn', problem: 'VAPID_SUBJECT not set; push services want a contact.', fix: 'Set VAPID_SUBJECT=mailto:you@yourdomain.' });
  if (!env.ADMIN_TOKEN) out.push({ key: 'ADMIN_TOKEN', level: 'warn', problem: '/admin (score validation, beta feedback, moderation) is switched off.', fix: 'Set ADMIN_TOKEN to a long random string (Render can generate one).' });
  else if (env.ADMIN_TOKEN.length < 20) out.push({ key: 'ADMIN_TOKEN', level: 'warn', problem: 'ADMIN_TOKEN is short and guessable.', fix: 'Use 20+ random characters.' });
  if (!env.OPEN_METEO_API_KEY) out.push({ key: 'OPEN_METEO_API_KEY', level: 'warn', problem: 'Using Open-Meteo’s free tier: non-commercial use only, shared rate limit.', fix: 'For a commercial launch, buy an API key at open-meteo.com and set OPEN_METEO_API_KEY.' });
  if (env.OPEN_METEO_API_KEY && (env.ROUTING_PROVIDER ?? 'fossgis') === 'fossgis')
    out.push({ key: 'ROUTING_PROVIDER', level: 'warn', problem: 'You look commercial (paid Open-Meteo key) but routing still uses the free FOSSGIS server, which is for light, non-commercial use.', fix: 'Set ROUTING_PROVIDER=ors with a paid ORS_API_KEY, or ROUTING_PROVIDER=osrm with your own OSRM_URL.' });
  if (!env.CONTACT_EMAIL) out.push({ key: 'CONTACT_EMAIL', level: 'warn', problem: 'MET Norway’s terms ask for a contact in the User-Agent.', fix: 'Set CONTACT_EMAIL to a real address.' });
  return out;
}

export function banner(issues: ConfigIssue[]): string {
  if (!issues.length) return '[nordurljos] production settings: all good ✓';
  const bar = '!'.repeat(78);
  const lines = issues.map((i) => `  ${i.level === 'error' ? 'ERROR' : 'warn '}  ${i.key}: ${i.problem}\n         → ${i.fix}`);
  return [bar, `  NORÐURLJÓS SETTINGS: ${issues.filter((i) => i.level === 'error').length} error(s), ${issues.filter((i) => i.level === 'warn').length} warning(s)`, ...lines, bar].join('\n');
}
