'use client';

import type { LocalizedText } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';

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
  // Görsel `UnderlineTabs`'ta (diyalog bölüm sekmeleriyle ORTAK); burada yalnız dile özgü kısım kalır:
  // dil kodu + eksik dil işareti.
  const items = LOCALES.map((l) => {
    // Eksik dil işareti: KELİME değil küçük nokta — dil kodunun yanındaki metin ("öneri") ne demek
    // istediğini söylemiyordu. Anlam ipucu title'da. TR kaynak olduğu için hariç.
    const showHint = filled ? !filled[l] && l !== 'tr' : false;
    return {
      key: l,
      title: showHint ? 'Bu dilde metin yok' : undefined,
      label: (
        <>
          {l.toUpperCase()}
          {showHint ? <span className="ml-1 inline-block h-[5px] w-[5px] rounded-full bg-ops-amber align-middle" /> : null}
        </>
      ),
    };
  });

  return <UnderlineTabs items={items} value={value} onChange={onChange} />;
}
