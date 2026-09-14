import type { ReactNode } from 'react';

// Sağ panelin ortak parçaları (12.17) — hareket ve belge panelleri aynı başlık ve kapatma dilini
// konuşur; iki panelde ayrı yazılsaydı biri bir gün ötekinden farklı görünürdü.

interface PanelSectionProps {
  title: string;
  hint?: string;
  children: ReactNode;
}

export function PanelSection({ title, hint, children }: PanelSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">{title}</span>
        {hint ? <span className="min-w-0 truncate font-ops-body text-ops-micro text-ops-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

interface CloseButtonProps {
  onClick: () => void;
}

export function CloseButton({ onClick }: CloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ayrıntıyı kapat"
      title="Kapat"
      className="flex-none cursor-pointer rounded-ops-btn px-1.5 py-0.5 text-ops-faint transition-colors hover:bg-ops-subtle hover:text-ops-ink"
    >
      ✕
    </button>
  );
}
