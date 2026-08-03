import type { Locale } from '@lezzet/i18n';
import { LegalPage } from '@/components/customer/legal/legal-page';
import content from './content.json';

/**
 * Teslimat ve iade (08.8) — statik sayfaların **yapılandırılmış bilgi** dokusu.
 *
 * Beş statik sayfanın en çok okunanı: içerik envanteri *"satın alma öncesi en çok merak edilen
 * içerik"* diyor ve doğru — soğuk zincirle gıda satan bir işte müşterinin ilk sorusu "nasıl
 * geliyor" oldu. Metin sistemin GERÇEK davranışını anlatıyor (posta kodu süzgeci, eksik kalemin
 * otomatik iadesi, kapıda ödemede tahsilatın düşmesi); bunlar uydurulmuş vaatler değil, kodda
 * karşılığı olan kurallar — bir gün değişirlerse bu sayfa da değişmek zorunda.
 */
interface DeliveryPageProps {
  params: Promise<{ locale: string }>;
}

export default async function DeliveryPage({ params }: DeliveryPageProps) {
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
            { label: copy.notice.faq, href: '/legal/faq' },
            { label: copy.notice.support, href: '/support/new' },
          ],
        },
      }}
    />
  );
}
