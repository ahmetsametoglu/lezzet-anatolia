import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
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
