import { haptic } from './haptics';

/** Native share sheet where available; otherwise copy to clipboard. Returns what happened. */
export async function shareText(title: string, text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      haptic('success');
      return 'shared';
    }
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    haptic('success');
    return 'copied';
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'failed';
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}

export async function shareFile(file: File, title: string, text: string): Promise<'shared' | 'downloaded'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text });
      return 'shared';
    } catch {
      /* fall through to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

export const isApple = () => /iPhone|iPad|Macintosh/.test(navigator.userAgent);
