import { reserveOrderStock as reserveOrderStockFor } from '@lezzet/application';
import type { ReserveOrderInput, ReserveOutcome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

/**
 * Siparişin stoğunu ayırır — **iki ödeme yolunun ortak adımı**.
 *
 * **Geçiş köprüsü** (sipariş zinciri terfisi, aşama 2/3): gövde `@lezzet/application`'ın
 * `order/reserve`ine taşındı — kural artık ORADA yaşıyor. Ayırmanın sırası ödeme yöntemine bağlı
 * (ORDER_LIFECYCLE: online → `draft`ta ve TTL'li; kapıda/vadeli → `confirmed`te ve süresiz) ve
 * "ya hepsi ya hiçbiri" geri bırakması kolay unutulan bir ayrıntı: iki kopyanın biri onu
 * unuttuğunda stok sessizce kilitli kalırdı.
 */
export async function reserveOrderStock(input: ReserveOrderInput): Promise<ReserveOutcome> {
  return reserveOrderStockFor(serviceDb(), input);
}
