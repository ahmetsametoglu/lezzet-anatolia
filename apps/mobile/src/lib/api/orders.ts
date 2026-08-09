import type { z } from 'zod';
import { MeOrderDetailSchema, MeOrderPageSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/orders` — "Siparişlerim" listesi + sipariş detayı (21.18).

  ŞEMA BURADA YAZILMAZ (`addresses.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta ve UÇ DA aynı
  şemayla üretiyor (02-mimari §3.2) — alan adı değişirse üreten ve tüketen aynı anda derlemede
  kırılır. Bu dosyanın işi yalnız sorgu dizesini kurmak ve şemayı istemciye vermek.

  KORUNAN ÇAĞRI (`authorizedFetch`), çıplak `apiFetch` değil: uçlar Bearer'ın arkasında ve oturum
  yoksa çağrı ağa HİÇ çıkmaz, yerel kısa devreyle `401 unauthorized` döner. Sipariş listesi bunu
  MİSAFİR olarak okur (ekran giriş kapısı çizer) — veri katmanı yönlendirme yapmaz (02-mimari §4).

  `locale` HER İSTEKTE zorunlu: uç dilsiz çağrıyı 400'le reddediyor (ürün adları sessizce Türkçeye
  düşmesin diye). Değer cihazın dilinden çözülür (`lib/i18n/locale.ts`), ekranların kararı değil.
*/

/** Liste satırı — alan kümesi sözleşmenin kendisi. */
export type OrderSummary = z.infer<typeof MeOrderPageSchema>['orders'][number];
/** Detay — sayfanın tamamı tek turda. */
export type OrderDetail = z.infer<typeof MeOrderDetailSchema>;

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ (katalog istemcisinin kuralı). */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * Sipariş sayfası — keyset imleçli (`nextCursor === null` → liste bitti).
 *
 * İmleç OPAK bir dizedir: yorumlanmaz, aynen geri verilir. İçinin ne olduğu sunucunun bileceği iş;
 * istemci onu okumaya kalksaydı keyset'in şekli sözleşme olurdu.
 */
export function fetchOrders(locale: Locale, cursor?: string): Promise<ApiResult<z.infer<typeof MeOrderPageSchema>>> {
  return authorizedFetch(`/api/v1/me/orders${queryOf({ locale, cursor })}`, MeOrderPageSchema);
}

/**
 * Tek siparişin detayı — adres REFERANS numarasıdır (`LA-26-…`), sipariş kimliği değil: müşteriye
 * gösterilen ve destekle konuşurken kullanılan numara odur (sözleşme künyesi).
 *
 * Bulunamayan · başkasına ait · taslak — üçü de 404 alır; ekran "bu sipariş bulunamadı" bloğunu
 * çizer (ayrım söylenirse numara denenerek başkasının siparişi doğrulatılabilirdi).
 */
export function fetchOrderDetail(reference: string, locale: Locale): Promise<ApiResult<OrderDetail>> {
  return authorizedFetch(
    `/api/v1/me/orders/${encodeURIComponent(reference)}${queryOf({ locale })}`,
    MeOrderDetailSchema,
  );
}
