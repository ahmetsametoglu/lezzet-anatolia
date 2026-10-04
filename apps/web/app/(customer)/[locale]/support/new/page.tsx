import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import supportMessages from '@lezzet/i18n/customer/support';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getCustomerOrderDetail, listCustomerOrders } from '@/lib/order/customer-orders';
import { listCustomerTickets } from '@/lib/ticket/read';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { NewTicketClient } from './new-ticket-client';
import type { Messages } from '../support-types';
import messages from '../messages.json';

/**
 * Talep açma; siparişten gelinirse (`?order=`) kalemler hazır gelir, genel yoldan gelinirse önce "bir siparişle mi ilgili" sorulur.
 * Telefonda taleplerin listesi de okunur, çünkü çekmece native'deki gibi listenin üstünde açılır.
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

  const [device, order, orders, tickets] = await Promise.all([
    detectDevice(),
    orderId ? getCustomerOrderDetail(locale as Locale, customerId, orderId) : Promise.resolve(null),
    // Seçici için ilk sayfa yeter: müşteri şikâyetini yakın zamanda aldığı siparişe yazar ve burada bir seçim yapılıyor, arşiv değil.
    orderId ? Promise.resolve(null) : listCustomerOrders(locale as Locale, customerId),
    listCustomerTickets(customerId),
  ]);

  // Rota bir sipariş söylüyor ama o sipariş yok ya da başkasının: 404, çünkü ayrımı söylemek olmayan siparişin varlığını doğrulatırdı.
  if (orderId && !order) notFound();

  const phone = supportMessages[locale].list;

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={
        device === 'mobile'
          ? {
              nav: 'support',
              back: { label: t.backToAccount, href: '/account' },
              title: t.title,
              // Boş listede çizilmez, çünkü ortadaki düğme aynı işi farklı adla yapardı.
              right:
                tickets.rows.length === 0 ? undefined : <TextAction label={phone.new} ariaLabel={phone.newLabel} href="/support/new" />,
            }
          : {
              nav: 'support',
              back: order
                ? {
                    label: `← ${order.referenceNo ?? ''}`.trim(),
                    href: { pathname: '/orders/[reference]', params: { reference: order.id } },
                  }
                : { label: t.backToList, href: '/support' },
              title: order ? t.new.title : t.new.generalTitle,
            }
      }
      fill={device === 'mobile'}
    >
      <NewTicketClient
        t={t}
        locale={locale as Locale}
        device={device}
        tickets={tickets}
        order={order}
        // Ödeme bekleyen siparişin numarası yok; talep numaralı siparişe bağlanır.
        orders={orders?.orders.filter((row) => row.status !== 'awaiting_payment') ?? []}
      />
    </SiteFrame>
  );
}
