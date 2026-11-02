import { useSettings } from '../lib/store';

export function Header({ onLocation }: { onLocation: () => void }) {
  const { theme, setTheme, location } = useSettings();
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-2 flex items-center gap-2 bg-bg/80 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold tracking-tight">Norðurljós</h1>
        <button
          onClick={onLocation}
          className="flex max-w-full items-center gap-1 truncate text-sm text-muted underline-offset-4 hover:underline"
          aria-label={`Location: ${location.label}. Change location`}
        >
          <span aria-hidden>{location.source === 'gps' ? '◉' : '◎'}</span>
          <span className="truncate">{location.label}</span>
          <span aria-hidden>▾</span>
        </button>
      </div>
      <button
        onClick={() => setTheme(theme === 'red' ? 'dark' : 'red')}
        aria-pressed={theme === 'red'}
        className={`min-h-12 min-w-12 rounded-2xl border px-4 text-sm font-semibold ${
          theme === 'red' ? 'border-accent bg-surface-2 text-accent' : 'border-line bg-surface text-fg'
        }`}
      >
        {theme === 'red' ? 'Red ✓' : 'Red mode'}
      </button>
    </header>
  );
}
