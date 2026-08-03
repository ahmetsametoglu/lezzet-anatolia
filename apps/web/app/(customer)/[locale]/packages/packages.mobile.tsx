'use client';

import { PackageListCard } from '@/components/customer/ui/package-card';
import { CartBar } from '@/components/customer/cart/cart-bar';
import { buttonClass } from '@/components/customer/ui/button';
import { Link } from '@/i18n/navigation';
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
        <div className="mx-4 mt-2 flex flex-col items-center gap-2 rounded-card border border-dashed border-sand-500 px-5 py-8 text-center">
          <span className="text-icon">🎁</span>
          <span className="font-sans text-note font-bold text-ink">{t.empty.title}</span>
          <span className="font-sans text-micro text-muted">{t.empty.body}</span>
          <Link href="/catalog" className={buttonClass({ size: 'sm', compact: true, className: 'mt-1' })}>
            {t.empty.cta}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-5">
          {packages.map((pack) => (
            <PackageListCard key={pack.id} pack={pack} locale={locale} labels={t} compact />
          ))}
        </div>
      )}

      {/* Katalog çıkışı mobilde ızgaranın ALTINDA tek düğme (tasarım): masaüstündeki iki sütunlu
          bant dar ekranda üç satıra yayılıp sayfayı uzatıyor, verdiği tek yön ise aynı. */}
      {packages.length > 0 && (
        <div className="px-4 pb-6">
          <Link href="/catalog" className={buttonClass({ variant: 'outlineOlive', size: 'md', compact: true, fullWidth: true })}>
            {t.catalogBand.cta}
          </Link>
        </div>
      )}

      <CartBar locale={locale} />
    </div>
  );
}
