import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import content from './content.json';

/**
 * Satış koşulları / CGV (08.8) — sipariş verenin onayladığı çerçeve.
 *
 * Metin sistemin GERÇEK kurallarını yazıyor, genel bir CGV şablonu değil: fiyatın sepette
 * sabitlendiği (`CartEntry` fiyat taşımaz, her okumada çözülür), stokta çıkmayan kalemin siparişi
 * iptal ETMEDİĞİ (eksik karşılama + otomatik iade), kapıda ödemede eksik kalemin baştan düşüldüğü.
 * Üçü de kodda karşılığı olan davranışlar — biri değişirse bu sayfa da değişmek zorunda.
 *
 * **Cayma hakkının uygulanmaması bir tercih değil, mevzuatın çabuk bozulan gıda istisnası**
 * (Code de la consommation L221-28). Sayfa bunu saklamıyor, gerekçesiyle yazıyor ve hemen ardından
 * hatalı teslimattaki hakların DURDUĞUNU söylüyor — müşteri "hiçbir hakkım yok" diye okumasın.
 *
 * BEKLEYEN(08.8): tüketici arabulucusunun adı ve iletişim bilgisi — işletmenin hangi arabuluculuk
 * kuruluşuna üye olduğu belgede yok ve rastgele bir kurum adı yazmak, müşteriyi olmayan bir kapıya
 * göndermek olurdu. Gelince `uyusmazlik` bölümünün son paragrafına yazılır.
 */
interface SalesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: SalesPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/sales', locale, (content[locale as Locale] ?? content.fr).title);
}

export default async function SalesPage({ params }: SalesPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;

  return (
    <LegalPage
      locale={locale}
      document={{
        texture: 'prose',
        title: copy.title,
        updatedAt: '2026-07-01',
        sections: copy.sections,
        notice: {
          text: copy.notice.text,
          links: [
            { label: copy.notice.delivery, href: '/legal/delivery' },
            { label: copy.notice.support, href: '/support/new' },
          ],
        },
      }}
    />
  );
}
