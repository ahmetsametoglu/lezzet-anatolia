'use client';

import type { Locale } from '@lezzet/i18n';
import type { Page } from '@lezzet/types';
import { useRouter } from '@/i18n/navigation';
import type { Device } from '@/lib/device';
import type { CustomerOrderDetail, CustomerOrderSummary } from '@/lib/order/customer-orders';
import type { CustomerTicketSummary } from '@/lib/ticket/ticket-types';
import { PhoneNewTicketSheet } from '../components/phone-new-ticket-sheet';
import { SupportClient } from '../support-client';
import type { Messages } from '../support-types';

/**
 * Telefonda yeni talep, native'deki gibi taleplerin listesinin üstünde açılan çekmecedir; bu rota listeyi çizip çekmeceyi açık getirir,
 * böylece hesap menüsünden ya da siparişten gelen bağlantı da aynı çekmeceye düşer. Kapanınca liste kalır.
 */
interface NewTicketMobileProps {
  t: Messages;
  locale: Locale;
  device: Device;
  tickets: Page<CustomerTicketSummary>;
  order: CustomerOrderDetail | null;
  orders: readonly CustomerOrderSummary[];
}

export function NewTicketMobile({ t, locale, device, tickets, order, orders }: NewTicketMobileProps) {
  const router = useRouter();

  return (
    <>
      <SupportClient t={t} locale={locale} device={device} mode="list" first={tickets} selected={null} />
      <PhoneNewTicketSheet t={t} locale={locale} order={order} orders={orders} onClose={() => router.replace('/support')} />
    </>
  );
}
