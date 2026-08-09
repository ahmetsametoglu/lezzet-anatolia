import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getCustomerOrderDetail } from '@/lib/order/customer-orders';
import { orderIdOrNull } from '@/lib/order/order-id';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { ReorderButton } from '../components/reorder-button';
import { DetailClient } from './detail-client';
import type { Messages } from './detail-types';
import type { Messages as ListMessages } from '../orders-types';
import messages from './messages.json';
import listMessages from '../messages.json';

/**
 * Sipariş detay (08.5) — sipariş onay sayfasındaki "sipariş takip" düğmesinin ve onay mailindeki
 * bağın varış noktası. İkisi de bugüne kadar ölüydü.
 *
 * **Yolda taşınan kimlik SİPARİŞ KİMLİĞİDİR**, referans numarası değil — segment adı `[reference]`
 * ama `/checkout/[reference]` ile aynı karar: numara ancak onayla doğuyor ve `getWithItems` kimlikle
 * okuyor. Segment adını değiştirmek `routing.ts`'teki üç dilli yolu da oynatırdı; kazanç yok.
 *
 * **Durum metinleri LİSTEDEN geliyor** (`listMessages`): rozet aynı altı hâli yazıyor ve iki mesaj
 * dosyasında iki "Teslim edildi" tutmak, bir gün ayrışan iki çeviri demekti.
 */
interface OrderDetailPageProps {
  params: Promise<{ locale: string; reference: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { locale, reference } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/orders/[reference]');

  const t: Messages = messages[locale];
  const listT: ListMessages = listMessages[locale];
  const [device, customerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  if (!customerId) redirect(`/${locale}${LOGIN_SEGMENT[locale]}`);

  // Bulunamayan · başkasına ait · BİÇİMİ GEÇERSİZ — üçü de AYNI cevabı alır. İlk ikisi bir güvenlik
  // kararıydı (ayrım söylenirse deneme yanılmayla başkasının sipariş kimliği doğrulatılabilirdi);
  // üçüncüsü 09.08'de ölçülerek eklendi — UUID olmayan segment servise kadar gidip veritabanı
  // hatasına düşüyor ve müşteriye 500 gösteriyordu (`order-id.ts` künyesi).
  const orderId = orderIdOrNull(reference);
  const order = orderId ? await getCustomerOrderDetail(locale as Locale, customerId, orderId) : null;
  if (!order) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        back: { label: t.back, href: '/orders' },
        title: order.referenceNo ?? '—',
        // Mobilde düğme başlıkta DEĞİL, sayfanın altında (tasarım) — sağ uç boş kalır ve başlık
        // ortada durur. Masaüstünde tasarım onu başlığın sağ ucuna koyuyor.
        right:
          device === 'mobile' ? undefined : (
            <ReorderButton locale={locale as Locale} orderId={order.id} />
          ),
      }}
    >
      <DetailClient t={t} listT={listT} locale={locale as Locale} order={order} device={device} />
    </SiteFrame>
  );
}

/** Giriş sayfasının dile göre segmenti — hesap/siparişler sayfalarıyla aynı gerekçe. */
const LOGIN_SEGMENT = routing.pathnames['/login'];
