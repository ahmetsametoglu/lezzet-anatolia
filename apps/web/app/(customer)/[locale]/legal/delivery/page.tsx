import type { Metadata } from 'next';
import { readPublicDeliveryTerms } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { deliveryTermsLines } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { legalCopy, legalDocument } from '@/components/customer/legal/legal-copy';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';

interface DeliveryPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: DeliveryPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/delivery', locale, legalDocument(locale, 'delivery').title);
}

export default async function DeliveryPage({ params }: DeliveryPageProps) {
  const { locale } = await params;
  void recordPageView('/legal/delivery');

  const doc = legalDocument(locale, 'delivery');
  const copy = legalCopy(locale).pages.delivery.amounts;
  /* Tutarlar metinden değil ayardan gelir: operatör ayarı değiştirince sayfa eski sayıyı ilan etmesin. Sunucu ayarı doğrudan
     okur ve satır yoksa motor kendi varsayılanına düşer, bu yüzden native'deki "okunamadı" hâli burada yok. */
  const terms = await readPublicDeliveryTerms(serviceDb());
  const amounts = {
    id: 'tutarlar',
    heading: copy.heading,
    paragraphs: [...deliveryTermsLines(terms, copy, locale as Locale), copy.note],
    bullets: [],
  };

  // "Nasıl geliyor" → "ne kadar" → "ters giderse ne olur": tutarlar iade bölümlerinden hemen önce.
  const sections = [...doc.sections.slice(0, -2), amounts, ...doc.sections.slice(-2)];
  return <LegalPage locale={locale} document={{ ...doc, sections }} />;
}
