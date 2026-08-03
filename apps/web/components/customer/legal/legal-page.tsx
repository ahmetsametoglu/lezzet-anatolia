import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { AppRoute, Locale } from '@lezzet/i18n';
import { localeAlternates } from '@/lib/seo/alternates';
import { detectDevice } from '@/lib/device';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { formatOrderDate } from '@/lib/storefront/format';
import { routing } from '@/i18n/routing';
import { LegalPageClient } from './legal-page-client';
import type { LegalDocument } from './legal-types';
import type { LegalMessages } from './legal-view-types';
import messages from './legal-messages.json';

/**
 * Beş statik sayfanın ORTAK sunucu kabuğu (08.8).
 *
 * Beş sayfanın `page.tsx`'i birebir aynı işi yapıyordu: dili doğrula, cihazı sez, tarihi biçimle,
 * çerçeveyi kur. Beş kopya yazmak `CLAUDE.md §1`'in ihlaliydi ve pratik sonucu şu olurdu — biri
 * `setRequestLocale`i unutur, o sayfa dilini kaybeder ve kimse fark etmez. Sayfalara kalan tek iş
 * kendi belgesini seçmek.
 *
 * **Sunucu bileşeni**: `detectDevice` ve tarih biçimleme burada, çatal bir alt katmanda.
 */
/**
 * Beş statik sayfanın ORTAK meta kurucusu (08.1) — başlık + `hreflang`.
 *
 * `generateMetadata` bir sayfa dosyasından export edilmek zorunda, yani beş `page.tsx`'in beşi de
 * kendi fonksiyonunu yazacaktı; gövde birebir aynı olurdu. Ortak kurucu sayesinde her sayfada
 * kalan tek satır, hangi rota ve hangi başlık olduğunu söylemek.
 *
 * Dil geçersizse boş dönüyor: sayfa zaten `notFound`'a düşecek, meta üretmenin anlamı yok.
 */
export function legalMetadata(route: AppRoute, locale: string, title: string): Metadata {
  if (!hasLocale(routing.locales, locale)) return {};
  return { title, alternates: localeAlternates(route, locale) };
}

interface LegalPageProps {
  locale: string;
  /** Belgeler dile göre ayrı yazılır; sayfa doğru olanı seçip verir. */
  document: LegalDocument;
}

export async function LegalPage({ locale, document: doc }: LegalPageProps) {
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: LegalMessages = messages[locale];
  const device = await detectDevice();
  /**
   * Tarih SUNUCUDA biçimlenir: iki cihaz dalı da aynı cümleyi alsın (`LegalViewProps` künyesi).
   *
   * Biçimleyicinin adı `formatOrderDate` ve burası bir sipariş değil — ama ürettiği biçim tam olarak
   * tasarımın istediği ("1 Temmuz 2026": gün + uzun ay + yıl). Aynı `Intl` çağrısını `formatLegalDate`
   * adıyla ikinci kez yazmak, tek farkı adı olan bir kopya üretmek olurdu; yıl taşıması da burada
   * şart, yasal metinde hangi sürüme bakıldığı yılsız anlaşılmaz.
   */
  const updatedLine = t.updatedAt.replace('{date}', formatOrderDate(doc.updatedAt, locale as Locale));

  return (
    <SiteFrame device={device} locale={locale}>
      <LegalPageClient device={device} document={doc} t={t} updatedLine={updatedLine} />
    </SiteFrame>
  );
}
