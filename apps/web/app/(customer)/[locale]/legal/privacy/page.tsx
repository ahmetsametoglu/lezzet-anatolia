import type { Metadata } from 'next';
import type { Locale } from '@lezzet/i18n';
import { LegalPage, legalMetadata } from '@/components/customer/legal/legal-page';
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
 * BEKLEYEN(08.8): **alıcı listesinde OLMAYAN bir alıcı sayılıyor** — *"Kargo firması: bölge dışı
 * gönderimlerde adınız ve teslimat adresiniz"*. Kargo kanalı henüz aktif değil, yani bugün böyle
 * bir paylaşım yok. Öteki üç sayfadaki kargo cümlelerinden AYRI ele alınmalı ve daha ağır: orada
 * yanlış olan bir hizmet tarifi, burada bir **veri paylaşımı beyanı**. Satır kanal açıldığında
 * doğru hâle gelecek; o güne kadar gerçekleşmeyen bir işlemeyi beyan ediyor. Ayrıntı `build/08` 08.8.
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
