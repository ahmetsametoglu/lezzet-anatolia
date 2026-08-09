import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';
import content from './content.json';

/**
 * SSS (08.8) — statik sayfaların **soru-cevap** dokusu.
 *
 * `sections` BOŞ ve bu bilinçli: SSS'nin gövdesi bölüm değil soru listesidir, o yüzden "Bu sayfada"
 * gezinmesi de çizilmez (şablon `sections.length > 1` şartına bakıyor). Bu sayfanın gezinmesi arama
 * kutusudur; ikisini birden koymak aynı işi iki kez sunmak olurdu.
 *
 * Çıkış bandı YOK, çünkü SSS'nin kendi çıkış kutusu var (kesikli çerçeveli "Cevabını bulamadınız
 * mı?") ve tasarımda ikisi ayrı ayrı çizili değil — aynı cümleyi iki kutuda tekrarlamak olurdu.
 *
 * **Metin DÜZELTİLDİ, işaret kaldırıldı (10.08 · ölçüm).** Sayfa bir dönem *"TÜM ürünlerimiz
 * şoklanmış halde"* ve *"kargo paketlerinde yalıtımlı kutu ve soğutucu kullanılır"* diyordu; ikisi
 * de gerçeğe aykırıydı — katalogda raf ürünü var ve soğuk zincir kargoya hiç verilmiyor. Bugünkü
 * `content.json` sistemin gerçek davranışını anlatıyor: kargoya yalnız raf ömürlü ürünler çıkar,
 * dondurulmuş olanlar yalnız kendi aracımızla bölge içinde gider (`Product.shippable` ile birebir).
 */
interface FaqPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: FaqPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/faq', locale, (content[locale as Locale] ?? content.fr).title);
}

export default async function FaqPage({ params }: FaqPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;
  void recordPageView('/legal/faq');

  return (
    <LegalPage
      locale={locale}
      document={{
        texture: 'faq',
        title: copy.title,
        updatedAt: '2026-07-01',
        sections: [],
        questions: copy.questions,
      }}
    />
  );
}
