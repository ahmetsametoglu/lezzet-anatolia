import 'server-only';
import { getCustomerOrderDetail as orderDetailFor, listCustomerOrders as listOrdersFor } from '@lezzet/application';
import type { CustomerOrderDetail, CustomerOrderPage } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import type { KeysetCursor } from '@lezzet/types';

/**
 * Web köprüsü: "Siparişlerim" listesi ve sipariş detayının gövdesi `@lezzet/application`da, iki yüzey aynı kapıyı çağırır. Köprü
 * `serviceDb()`yi enjekte eder ve web imzasını korur; `server-only` burada kalır.
 */
export type { CustomerOrderDetail, CustomerOrderDetailLine, CustomerOrderPage, CustomerOrderSummary } from '@lezzet/application';

/** "Siparişlerim" listesi; keyset sayfalı, ödemesi açılmamış taslak dışarıda. */
export function listCustomerOrders(locale: Locale, customerId: string, cursor?: KeysetCursor): Promise<CustomerOrderPage> {
  return listOrdersFor(serviceDb(), { customerId, locale, cursor });
}

/** Tek siparişin detayı; web segmenti adına rağmen sipariş kimliğini taşır, mobil aynı kapıyı referans numarasıyla çağırır. */
export function getCustomerOrderDetail(locale: Locale, customerId: string, orderId: string): Promise<CustomerOrderDetail | null> {
  return orderDetailFor(serviceDb(), { customerId, locale, lookup: { orderId } });
}
