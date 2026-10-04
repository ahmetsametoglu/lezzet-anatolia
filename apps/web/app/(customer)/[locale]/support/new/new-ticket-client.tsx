'use client';

import type { Locale } from '@lezzet/i18n';
import type { Page } from '@lezzet/types';
import type { Device } from '@/lib/device';
import type { CustomerOrderDetail, CustomerOrderSummary } from '@/lib/order/customer-orders';
import type { CustomerTicketSummary } from '@/lib/ticket/ticket-types';
import { useDevice } from '@/lib/use-device.hook';
import type { Messages } from '../support-types';
import { NewTicketDesktop } from './new-ticket.desktop';
import { NewTicketMobile } from './new-ticket.mobile';

/** Yeni talebin cihaz çatalı: telefonda listenin çekmecesi, masaüstünde tek sütunlu form sayfası. */
interface NewTicketClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  tickets: Page<CustomerTicketSummary>;
  order: CustomerOrderDetail | null;
  orders: readonly CustomerOrderSummary[];
}

export function NewTicketClient({ t, locale, device, tickets, order, orders }: NewTicketClientProps) {
  return useDevice(device) === 'mobile' ? (
    <NewTicketMobile t={t} locale={locale} device={device} tickets={tickets} order={order} orders={orders} />
  ) : (
    <NewTicketDesktop t={t} locale={locale} order={order} orders={orders} />
  );
}
