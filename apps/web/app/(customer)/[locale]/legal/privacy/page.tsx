import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
import { recordPageView } from '@/lib/analytics/page-view';
import content from './content.json';

/**
 * Gizlilik politikası (08.8) — hesap sayfasındaki ölü bağı AÇAN belge.
 *
 * `account.desktop.tsx` bir süredir *"gizlilik politikası — bağ VERİLMEZ, ölü link 404'e düşerdi"*
 * diyen bir işaret taşıyordu; bu sayfa onun karşılığı ve işaret kaldırıldı. (Söz dizimi bilerek
 * yazılmadı: kapanmış bir boşluğun hikâyesi, açık bir boşluk gibi sayılmamalı.)
 *
 * Metin sistemin GERÇEK davranışını anlatıyor, genel bir şablon değil: posta kodunun hesapsız da
 * tarayıcıda tutulduğu, iznin bayrak değil zaman+kaynak nesnesi olarak saklandığı, hata
 * kayıtlarında kişisel verinin yalnız maskeli göründüğü — üçü de kodda karşılığı olan kurallar
 * (`lib/delivery/place-store.ts`, `account/actions.ts`, `packages/observability/src/mask.ts`).
 * Uydurulmuş bir gizlilik metni, tutulmayacak bir söz vermek olurdu.
 *
 * **Kargo firması satırı DOĞRU — işaret kaldırıldı (10.08 · kullanıcı teyidi).** Bir dönem burada
 * *"alıcı listesinde OLMAYAN bir alıcı sayılıyor"* diye bir `BEKLEYEN(08.8)` duruyordu: kargo
 * kanalının açık olmadığı varsayılıyor, yani beyan gerçekleşmeyen bir işlemeyi anlatıyor sanılıyordu.
 * Kullanıcı teyit etti: **bölge dışına kargo gönderimi yapılıyor**, dolayısıyla ad ve teslimat
 * adresi gerçekten taşıyıcıyla paylaşılıyor ve beyan olması gerektiği gibi duruyor.
 *
 * Ölçüm de aynı yeri gösteriyordu: `legal/delivery` kargo ücretini ve süresini yazıyor, vitrin
 * `route: 'shipping'` ile kargo grubunu ayırıyor, checkout kargo siparişini ayrı açıyor. Beyanı
 * kaldırmak, gerçekleşen bir paylaşımı gizlemek olurdu — eksik beyan, fazla beyandan ağırdır.
 */
interface PrivacyPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata('/legal/privacy', locale, (content[locale as Locale] ?? content.fr).title);
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  const copy = content[locale as Locale] ?? content.fr;
  void recordPageView('/legal/privacy');

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
            { label: copy.notice.account, href: '/account' },
            { label: copy.notice.support, href: '/support/new' },
          ],
        },
      }}
    />
  );
}
