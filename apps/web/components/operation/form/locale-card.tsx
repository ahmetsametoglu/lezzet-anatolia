'use client';

import { useState, type ReactNode } from 'react';
import type { LocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { LocaleTabs, filledLocales } from './locale-tabs';

/**
 * Dil kartı — çok dilli alanları TEK bir görünür sınır içinde toplar; dil kartın kendi sekmesiyle
 * değişir. Neden kart: dili form GENELİNDEN (dialog header) yönetmek görünmez bir kip yaratır —
 * hangi alanların o dile bağlı olduğu arayüzde yazmaz. Kartın içi = seçili dilin alanı, dışı = dilden
 * bağımsız alanlar (KDV, marj, aktiflik…). Böylece kip görünür olur ve eksik dil ipucu doğru yerde çıkar.
 *
 * Alan tipleri değişmez: içine konan `FormLocalizedText`'e `lang` verilir (kontrollü mod) — kart yalnız
 * kabuktur, dil durumunu tutar ve çocuklarına geçirir. Görsel dil mevcut kart desenidir (ops-line
 * çerçeve + 10px köşe); sekmeler paylaşılan `LocaleTabs` (no-duplication).
 */
interface LocaleCardProps {
  /** Kart etiketi (sol üst). */
  title?: string;
  /**
   * Doluluk ipucunun dayandığı metin — genelde ZORUNLU alan (ör. ad). Verilirse eksik diller sekmede
   * "öneri" ile işaretlenir; verilmezse sade sekme.
   */
  completenessOf?: LocalizedText;
  /** Alanlar seçili dille kurulur (FormLocalizedText'e `lang={lang}` geçirilir). */
  children: (lang: Locale) => ReactNode;
}

export function LocaleCard({ title = 'İçerik', completenessOf, children }: LocaleCardProps) {
  const [lang, setLang] = useState<Locale>('tr');

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-ops-line">
      <div className="flex items-center gap-3 border-b border-ops-line-soft bg-ops-subtle px-3.5">
        <span className="mr-auto font-ops-display text-[10px] font-medium uppercase tracking-[0.08em] text-ops-muted">
          {title}
        </span>
        <LocaleTabs value={lang} onChange={setLang} filled={completenessOf ? filledLocales(completenessOf) : undefined} />
      </div>
      <div className="flex flex-col gap-4 p-3.5">{children(lang)}</div>
    </div>
  );
}
