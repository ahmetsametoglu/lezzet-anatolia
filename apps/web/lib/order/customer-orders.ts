import 'server-only';
import { getCustomerOrderDetail as orderDetailFor, listCustomerOrders as listOrdersFor } from '@lezzet/application';
import type { CustomerOrderDetail, CustomerOrderPage } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import type { KeysetCursor } from '@lezzet/types';

/**
 * **Geçiş köprüsü** — "Siparişlerim" listesinin ve sipariş detayının gövdesi
 * `@lezzet/application/order/customer-orders`ta (terfi aşama 2/3, 10.08 · denetim K5-1). Künyenin
 * tamamı orada: para sözleşmesi (`…Cents`), taslakların neden listede olmadığı, paketin neden tek
 * satıra katlandığı, sahipliğin neden "bulunamadı" ile aynı cevabı verdiği.
 *
 * **Neden köprüye indi.** Aynı iki kapıyı artık iki yüzey çağırıyor (web sipariş sayfaları + mobil
 * `vOrders`/`vOrder`). Web nüshası yerinde bırakıldığı için sipariş okuması iki yerde yaşıyordu;
 * paketteki düzeltme web'e, web'deki düzeltme uygulamaya geçmiyordu.
 *
 * **Bu köprü `serviceDb()`yi enjekte ediyor ve web imzasını koruyor** — çağıran sayfa/action'lar
 * yerinden oynamıyor. Paket `db`yi çağıranından alır (taşıma-bağımsız), web tarafında o çağıran
 * burasıdır; `server-only` de burada kalır.
 *
 * ── BENİMSEMEDE İKİ ŞEKİL FARKI (ikisi de bilinçli, kural farkı DEĞİL) ──────
 * · Liste satırı artık `productNames` yerine `thumbs` taşıyor: ad + görsel. Ekranın bugün
 *   kullandığı tek şey ad ve onu `orderProductNames` veriyor; görsel alanı mobil kartın küçük resim
 *   yığını için orada duruyor ve web'e de açık.
 * · Detaydaki paket künyesi vitrin kapısından değil doğrudan paket servisinden okunuyor: sipariş
 *   geçmişi bir KAYITTIR, satılabilirlik süzgeci oraya sızarsa ürünlerden biri pasife alındığında
 *   geçmiş sipariş dün tek satır bugün beş satır görünür (paket künyesi orada gerekçeli).
 */
export type {
  CustomerOrderDetail,
  CustomerOrderDetailLine,
  CustomerOrderPage,
  CustomerOrderSummary,
} from '@lezzet/application';

/** "Siparişlerim" listesi — keyset sayfalama, taslaklar dışarıda. */
export function listCustomerOrders(locale: Locale, customerId: string, cursor?: KeysetCursor): Promise<CustomerOrderPage> {
  return listOrdersFor(serviceDb(), { customerId, locale, cursor });
}

/**
 * Tek siparişin detayı. Web `/orders/[reference]` segmenti adına rağmen sipariş UUID'sini taşıyor
 * (`orderIdOrNull` künyesi) — bu yüzden kimlik dalı kullanılıyor; mobil aynı kapıyı referans
 * numarasıyla çağırıyor.
 */
export function getCustomerOrderDetail(
  locale: Locale,
  customerId: string,
  orderId: string,
): Promise<CustomerOrderDetail | null> {
  return orderDetailFor(serviceDb(), { customerId, locale, lookup: { orderId } });
}
