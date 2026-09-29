import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getCustomerOrderDetail, listCustomerOrders } from '@/lib/order/customer-orders';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { NewTicketForm } from './new-ticket-form';
import type { Messages } from '../support-types';
import messages from '../messages.json';

/**
 * Talep açma; siparişten gelinirse (`?order=`) kalemler hazır listelenir, genel yoldan gelinirse önce "bir siparişle mi ilgili"
 * sorulur. Cihaz çatalı yok, çünkü tasarım iki cihazda aynı tek sütunlu formu istiyor ve fark yalnız genişlik.
 */
interface NewTicketPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string }>;
}

export default async function NewTicketPage({ params, searchParams }: NewTicketPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/support/new');

  const { order: orderId } = await searchParams;
  const t: Messages = messages[locale];

  const customerId = await currentCustomerId();
  // Segment tablosu yolu BAŞINDA bölü ile taşıyor; ikinci bir bölü eklenmez.
  if (!customerId) {
    /* Girişten sonra bu forma dönülür, ki sohbetteki talep bağlantısını açan müşteri formu kaybetmesin; sipariş de korunur. */
    const buraya = `/${locale}${routing.pathnames['/support/new'][locale]}${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
    redirect(`/${locale}${routing.pathnames['/login'][locale]}?next=${encodeURIComponent(buraya)}`);
  }

  const [device, order, orders] = await Promise.all([
    detectDevice(),
    orderId ? getCustomerOrderDetail(locale as Locale, customerId, orderId) : Promise.resolve(null),
    // Seçici için ilk sayfa yeter: müşteri şikâyetini eski bir siparişe değil, yakın zamanda
    // aldığına yazar. Sayfalama eklemek listeyi arşive çevirir, oysa burada bir SEÇİM yapılıyor.
    orderId ? Promise.resolve(null) : listCustomerOrders(locale as Locale, customerId),
  ]);

  // Rota bir sipariş söylüyor ama o sipariş yok ya da başkasının: 404. "Yok" ile "senin değil"
  // ayrımını yapmak, olmayan bir siparişin varlığını doğrulatmak olurdu.
  if (orderId && !order) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        nav: 'support',
        back: order
          ? { label: `← ${order.referenceNo ?? ''}`.trim(), href: { pathname: '/orders/[reference]', params: { reference: order.id } } }
          : { label: t.backToList, href: '/support' },
        title: order ? t.new.title : t.new.generalTitle,
      }}
    >
      <NewTicketForm
        t={t}
        locale={locale as Locale}
        device={device}
        order={order}
        // Ödeme bekleyen siparişin numarası yok; talep numaralı siparişe bağlanır.
        orders={orders?.orders.filter((row) => row.status !== 'awaiting_payment') ?? []}
      />
    </SiteFrame>
  );
}
