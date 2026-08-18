import type { Metadata } from 'next';
import { readPublicDeliveryTerms } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { deliveryTermsLines } from '@lezzet/helper';
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

  /**
   * **TUTARLAR AYARDAN, METİNDEN DEĞİL** (18.08 · kullanıcı kararı).
   *
   * Sayfa bir dönem *"Kargo ücreti 7,90 €'dur ve 60 € üzeri siparişlerde alınmaz"* diyordu; ikisi
   * de `settings` satırı ve operatör Ayarlar'dan değiştirebiliyor. Değiştirdiği gün sepet yeni
   * sayıyı keser, bu sayfa eskisini ilan etmeye devam ederdi — kimse de fark etmezdi, çünkü metin
   * hesap yapmıyor, yazıyor. Asgari sepette daha kötüsü vardı: *"her iki gönderim yolunda da
   * geçerlidir"* KODUN TERSİNİ söylüyordu (`min-basket.ts` · kullanıcı kararı 10.08 — kargo
   * siparişinin lojistik tabanı yoktur).
   *
   * Cümleyi kuran yer iki yüzeyin ortak kuralıdır (`deliveryTermsLines`), sayfa yalnız sözlüğü ve
   * ölçülen değerleri veriyor. Native tarafın aksine burada "okunamadı" hâli yok: sunucu bileşeni
   * ayarları doğrudan okuyor ve ayar satırı yoksa motor kendi varsayılanına düşüyor.
   */
  const terms = await readPublicDeliveryTerms(serviceDb());
  const amounts = {
    id: 'tutarlar',
    heading: copy.amounts.heading,
    body: [...deliveryTermsLines(terms, copy.amounts, locale as Locale), copy.amounts.note],
  };

  return (
    <LegalPage
      locale={locale}
      document={{
        texture: 'prose',
        title: copy.title,
        updatedAt: '2026-07-01',
        /* "Güncel tutarlar" SONDAN BİR ÖNCEKİ: iade koşullarından önce, kargo anlatımından sonra —
           sayfayı okuyan sırayla "nasıl geliyor" → "ne kadar" → "ters giderse ne olur" diye ilerler. */
        sections: [...copy.sections.slice(0, -2), amounts, ...copy.sections.slice(-2)],
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
