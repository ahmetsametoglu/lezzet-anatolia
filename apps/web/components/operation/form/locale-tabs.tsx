'use client';

import { LOCALES, type Locale } from '@lezzet/i18n';

// Dil sekmeleri (TR/FR/DE) — çok dilli metin için ortak switcher. FormLocalizedText'in kendi sekmesi
// (tek alan) ve form geneli dil bağlamı (dialog header) AYNI komponenti kullanır (no-duplication).
// `filled` verilirse dolu olmayan diller (TR hariç) "öneri" ile işaretlenir.

interface LocaleTabsProps {
  value: Locale;
  onChange: (l: Locale) => void;
  /** Dil doluluk ipucu; verilmezse hiç işaret gösterilmez (form geneli sade sekme). */
  filled?: Partial<Record<Locale, boolean>>;
}

export function LocaleTabs({ value, onChange, filled }: LocaleTabsProps) {
  return (
    <div className="flex gap-1.5">
      {LOCALES.map((l) => {
        const on = l === value;
        const showHint = filled ? !filled[l] && l !== 'tr' : false;
        return (
          <button
            key={l}
            type="button"
            onClick={() => onChange(l)}
            className={[
              'cursor-pointer px-2.5 py-[5px] font-ops-display text-[12px] font-semibold transition-colors',
              on ? 'border-b-2 border-ops-olive text-ops-ink' : 'text-ops-muted hover:text-ops-strong',
            ].join(' ')}
          >
            {l.toUpperCase()}
            {showHint ? <span className="ml-0.5 text-ops-amber">öneri</span> : null}
          </button>
        );
      })}
    </div>
  );
}
