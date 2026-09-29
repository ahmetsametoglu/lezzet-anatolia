import type { z } from 'zod';
import { MeOrderDetailSchema, MeOrderPageSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import { queryString, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  `/api/v1/me/orders`: "Siparişlerim" listesi ve sipariş detayı; şema `@lezzet/types`ta, uç da onunla üretir. Çağrı korunur (oturum
  yoksa ağa çıkmadan `401`) ve `locale` her istekte zorunludur.
*/

/** Liste satırı — alan kümesi sözleşmenin kendisi. */
export type OrderSummary = z.infer<typeof MeOrderPageSchema>['orders'][number];
/** Numaralı satır; ödeme bekleyen sipariş numarasızdır ve detay yerine ödeme ekranını açar. */
export type NumberedOrderSummary = Exclude<OrderSummary, { reference: null }>;

export function isNumbered(order: OrderSummary): order is NumberedOrderSummary {
  return order.reference !== null;
}
/** Detay — sayfanın tamamı tek turda. */
export type OrderDetail = z.infer<typeof MeOrderDetailSchema>;

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ (katalog istemcisinin kuralı). */

/** Sipariş sayfası, keyset imleçli; imleç opaktır ve aynen geri verilir, `nextCursor === null` liste bitti demek. */
export function fetchOrders(locale: Locale, cursor?: string): Promise<ApiResult<z.infer<typeof MeOrderPageSchema>>> {
  return authorizedFetch(`/api/v1/me/orders${queryString({ locale, cursor })}`, MeOrderPageSchema);
}

/**
 * Tek siparişin detayı, referans numarasıyla adreslenir. Bulunamayan, başkasına ait ve taslak aynı 404'ü alır; ayrım söylenseydi
 * numara denenerek başkasının siparişi doğrulatılabilirdi.
 */
export function fetchOrderDetail(reference: string, locale: Locale): Promise<ApiResult<OrderDetail>> {
  return authorizedFetch(
    `/api/v1/me/orders/${encodeURIComponent(reference)}${queryString({ locale })}`,
    MeOrderDetailSchema,
  );
}
