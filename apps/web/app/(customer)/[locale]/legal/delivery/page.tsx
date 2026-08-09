import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';
import content from './content.json';

/**
 * Teslimat ve iade (08.8) — statik sayfaların **yapılandırılmış bilgi** dokusu.
 *
 * Beş statik sayfanın en çok okunanı: içerik envanteri *"satın alma öncesi en çok merak edilen
 * içerik"* diyor ve doğru — soğuk zincirle gıda satan bir işte müşterinin ilk sorusu "nasıl
 * geliyor" oldu. Metin sistemin GERÇEK davranışını anlatıyor (posta kodu süzgeci, eksik kalemin
 * otomatik iadesi, kapıda ödemede tahsilatın düşmesi); bunlar uydurulmuş vaatler değil, kodda
 * karşılığı olan kurallar — bir gün değişirlerse bu sayfa da değişmek zorunda.
 *
 * **Metin DÜZELTİLDİ, işaret kaldırıldı (10.08 · ölçüm).** Sayfa bir dönem *"bölge dışındaki
 * adreslere soğuk zincir kargo paketiyle gönderim yapıyoruz"* diyordu ve gerçek bunun tersiydi;
 * üstelik sayfa kendi içinde çelişiyordu (§2 doğruyu söylüyordu). Bugünkü `kargo` bölümü sistemin
 * davranışını anlatıyor: *"Bölge dışındaki adreslere yalnız raf ömürlü ürünlerimizi gönderiyoruz…
 * Dondurulmuş ürünler kargoya çıkmaz."* — `Product.shippable` ve vitrindeki `StockMark` diliyle
 * birebir aynı gerçek.
 */
interface DeliveryPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: DeliveryPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/delivery', locale, (content[locale as Locale] ?? content.fr).title);
}

export default async function DeliveryPage({ params }: DeliveryPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;
  void recordPageView('/legal/delivery');

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
            { label: copy.notice.faq, href: '/legal/faq' },
            { label: copy.notice.support, href: '/support/new' },
          ],
        },
      }}
    />
  );
}
