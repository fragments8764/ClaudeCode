import type { ReactNode } from 'react';

export function Card({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-line bg-surface/85 p-4 backdrop-blur-sm ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
