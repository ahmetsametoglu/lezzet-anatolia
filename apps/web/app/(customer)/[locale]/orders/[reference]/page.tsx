import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import ordersMessages from '@lezzet/i18n/customer/orders';
import { readOrderFeedbackInvite } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getCustomerOrderDetail } from '@/lib/order/customer-orders';
import { orderIdOrNull } from '@/lib/order/order-id';
import { OrderStatusTag } from '@/components/customer/phone-kit/order-status-tag';
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
 * Yolda taşınan kimlik sipariş kimliği, referans numarası değil, çünkü numara ancak onayla doğuyor. Durum metinleri listenin
 * sözlüğünden gelir ki iki dosyada tutulan iki çeviri bir gün ayrışmasın.
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

  // Bulunamayan, başkasına ait ve biçimi geçersiz aynı cevabı alır: ayrım başkasının sipariş kimliğini doğrulatır, geçersiz biçim
  // de veritabanı hatasına düşüp 500 gösterirdi.
  const orderId = orderIdOrNull(reference);
  const order = orderId ? await getCustomerOrderDetail(locale as Locale, customerId, orderId) : null;
  if (!order) notFound();

  // Yorum daveti SİPARİŞ DOĞRULANDIKTAN sonra okunur: sahiplik yukarıda çözüldü, token'ı ondan
  // önce okumak başkasının siparişine ait bir daveti sızdırmanın yolu olurdu. Sözleşme paylaşılan
  // (native aynısını uçtan alıyor) — iki yüzey aynı üç hâli aynı biçimde `null` görür.
  const feedbackInvite = await readOrderFeedbackInvite(serviceDb(), order.id);

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        back: { label: t.back, href: '/orders' },
        title: order.referenceNo ?? '—',
        // Telefonda başlığın sağında native'in durum rozeti durur; tekrar sipariş orada sayfanın dibindeki düğmedir.
        right:
          device === 'mobile' ? (
            <OrderStatusTag status={order.status} label={ordersMessages[locale as Locale].status[order.status]} />
          ) : (
            <ReorderButton locale={locale as Locale} orderId={order.id} />
          ),
      }}
    >
      <DetailClient t={t} listT={listT} locale={locale as Locale} order={order} device={device} feedbackInvite={feedbackInvite} />
    </SiteFrame>
  );
}

/** Giriş sayfasının dile göre segmenti — hesap/siparişler sayfalarıyla aynı gerekçe. */
const LOGIN_SEGMENT = routing.pathnames['/login'];
