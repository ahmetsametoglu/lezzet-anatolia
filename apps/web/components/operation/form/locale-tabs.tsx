'use client';

import type { LocalizedText } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';

// Dil sekmeleri (TR/FR/DE) — çok dilli metin için ortak switcher. Alanın kendi sekmesi (FormLocalizedText),
// dil kartı (LocaleCard) ve form geneli dil bağlamı AYNI komponenti kullanır (no-duplication).
// `filled` verilirse dolu olmayan diller (TR hariç) "öneri" ile işaretlenir.

/** Hangi dillerin dolu olduğu — sekme "öneri" ipucunun TEK kaynağı (alan ve kart aynısını kullanır). */
export function filledLocales(text: LocalizedText): Partial<Record<Locale, boolean>> {
  return LOCALES.reduce<Partial<Record<Locale, boolean>>>((acc, l) => {
    acc[l] = Boolean(text[l]?.trim());
    return acc;
  }, {});
}

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
            {/* Eksik dil işareti: KELİME değil küçük nokta — dil kodunun yanındaki metin ("öneri")
                ne demek istediğini söylemiyordu. Anlam ipucu title'da. TR kaynak olduğu için hariç. */}
            {showHint ? (
              <span title="Bu dilde metin yok" className="ml-1 inline-block h-[5px] w-[5px] rounded-full bg-ops-amber align-middle" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
