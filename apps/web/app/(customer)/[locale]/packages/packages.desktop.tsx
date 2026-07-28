'use client';

import { useState } from 'react';
import { EmptyState } from '@/components/customer/ui/filter-controls';
import { PackageListCard } from '@/components/customer/ui/package-card';
import { Button } from '@/components/customer/ui/button';
import type { PackagesViewProps } from './packages-types';

/** İlk turda kaç kart basılır (tasarım). Sayfalama DEĞİL, gösterim kararı — veri tek turda geldi. */
const FIRST_PAGE = 12;

/**
 * Paketler — masaüstü düzeni (tasarım: `Musteri - Paketler.dc.html`, "Paketler Web").
 * Başlık bandı + üçlü ızgara. Süzgeç, arama ve sıralama YOKTUR: sıra yönetimin kurduğu seçkidir,
 * müşteriye seçenek sunmak kürasyonu bozar (tasarım sözleşmesi).
 *
 * "Daha fazla paket" sunucuya GİTMEZ: paket kümesi operatörün elle kurduğu, doğal tavanı olan bir
 * küme (CLAUDE.md §1) — tek turda okundu, düğme yalnız ilk 12'yi açıyor. Sayfalayan bir okuma
 * kurmak burada veriyle büyümeyen bir listeye keyset maliyeti bindirirdi.
 */
export function PackagesDesktop({ t, locale, packages }: PackagesViewProps) {
  const [shown, setShown] = useState(FIRST_PAGE);
  const visible = packages.slice(0, shown);

  return (
    <div className="flex flex-col gap-6 px-12 pt-9 pb-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-page-title text-ink">{t.title}</h1>
        <p className="max-w-[620px] font-sans text-body leading-relaxed text-body">{t.subtitle}</p>
      </div>

      {packages.length === 0 ? (
        <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🎁" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-6">
            {visible.map((pack) => (
              <PackageListCard key={pack.id} pack={pack} locale={locale} labels={t} />
            ))}
          </div>
          {shown < packages.length && (
            <Button variant="secondary" size="md" className="mx-auto" onClick={() => setShown((n) => n + FIRST_PAGE)}>
              {t.more}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
