import 'server-only';
import { serviceDb } from '@lezzet/database';
import { clearOrderedLines as clearOrderedLinesFor } from '@lezzet/application';

/**
 * Sipariş verilen satırların sepetten düşülmesi — **geçiş köprüsü** (terfi aşama 2/3, denetim K5-1).
 *
 * Gövde `@lezzet/application/cart/settle`ta; künyesi orada (neden yalnız SİPARİŞE giren satırların
 * silindiği, sonradan eklenen satırların neden sepette kaldığı).
 *
 * İkizin sessiz riski buydu: aynı kural web ödeme akışından bir dosyadan, mobil sipariş verme
 * kapısından (`order/place-order`) başkasından koşuyordu. Birinde düzeltilen bir hata ötekinde
 * kalırsa belirti "web'de sepet temizlendi, uygulamada temizlenmedi" olur.
 */

export function clearOrderedLines(customerId: string, orderId: string): Promise<void> {
  return clearOrderedLinesFor(serviceDb(), customerId, orderId);
}
