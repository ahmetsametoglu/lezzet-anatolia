'use client';

import { EmptyState } from '@/components/customer/ui/filter-controls';
import { PackageListCard } from '@/components/customer/ui/package-card';
import { CartBar } from '@/components/customer/cart/cart-bar';
import type { PackagesViewProps } from './packages-types';

/**
 * Paketler — mobil düzeni (tasarım: `Musteri - Paketler.dc.html`, "Paketler Mobil").
 *
 * Kartlar İKİ SÜTUN: "iki paketi yan yana tartmak birincil senaryo" (tasarım). Tek sütun kıyası
 * bozardı — paket seçimi karşılaştırmalı bir karardır.
 *
 * Mobilde "daha fazla" düğmesi yok, hepsi basılır: küme zaten sınırlı ve tasarım burada sonsuz
 * kaydırma istiyor — düğmesiz akış onun en sade karşılığı.
 */
export function PackagesMobile({ t, locale, packages }: PackagesViewProps) {
  return (
    <div className="flex flex-col pb-24">
      <div className="flex flex-col gap-1.5 px-4 pt-5 pb-3">
        <h1 className="font-serif text-page-title-sm text-ink">{t.title}</h1>
        <p className="font-sans text-note leading-relaxed text-body">{t.subtitle}</p>
      </div>

      {packages.length === 0 ? (
        <div className="px-4 pt-2">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🎁" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {packages.map((pack) => (
            <PackageListCard key={pack.id} pack={pack} locale={locale} labels={t} compact />
          ))}
        </div>
      )}

      <CartBar locale={locale} />
    </div>
  );
}
