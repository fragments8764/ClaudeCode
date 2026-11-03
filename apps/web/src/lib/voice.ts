import { useSettings } from './store';

/** Spoken alerts (Web Speech). Short, calm sentences; never requires interaction. */
const LANG: Record<string, string> = { en: 'en-GB', is: 'is-IS', de: 'de-DE', fr: 'fr-FR', zh: 'zh-CN', ja: 'ja-JP' };
let lastText = '';
let lastAt = 0;
export function speak(text: string, force = false) {
  const s = useSettings.getState();
  if (!force && !s.spokenAlerts) return;
  if (!('speechSynthesis' in window)) return;
  if (text === lastText && Date.now() - lastAt < 120_000) return; // don't repeat
  lastText = text;
  lastAt = Date.now();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANG[s.language] ?? 'en-GB';
  u.rate = 0.95;
  u.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
export const voiceSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
