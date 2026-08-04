import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';
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
 * BEKLEYEN(08.8): teslimat bölümü *"bölge dışına soğuk zincir kargo paketiyle teslim ediyoruz"*
 * diyor ve bu YANLIŞ — soğuk zincir ürünleri yalnız kendi aracımızla, bölge içinde gidiyor; kargo
 * paketi raf ürünlerini taşıyor (kullanıcı, 03.08). Kanal ayrıca henüz aktif değil. Aynı bölümdeki
 * "kargo firmasından kaynaklanan gecikmeler" ve giriş bölümündeki "Ürünlerimiz dondurulmuş
 * gıdadır" cümleleri de aynı turda düzeltilecek. Metnin nasıl yazılacağı kanalın açılış kararına
 * bağlı; ayrıntı ve öteki üç sayfa `docs/build/08` 08.8'de.
 *
 * **Tüketici arabulucusu KAPSAM DIŞI** (kullanıcı kararı 03.08): ilk aşamada bir arabuluculuk
 * kuruluşuyla anlaşma düşünülmüyor, dolayısıyla bekleyen bir iş değil — kapanmış bir karar.
 * `uyusmazlik` bölümü arabulucuya başvurmanın MÜMKÜN olduğunu söylüyor ve bu doğru; söylemediği
 * şey hangi kuruma başvurulacağı. Anlaşma yapıldığı gün eklenecek tek şey o kurumun adı ve
 * iletişimi. (Fransız mevzuatı satıcının kendi arabulucusunu bildirmesini bekler — karar
 * kullanıcınındır ve bilinerek verilmiştir, `docs/build/08` 08.8'de kayıtlı.)
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
  void recordPageView();

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
