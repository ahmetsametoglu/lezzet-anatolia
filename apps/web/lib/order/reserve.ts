import { ReservationService, SettingsService, serviceDb } from '@lezzet/database';
import type { OrderItem } from '@lezzet/types';

/**
 * Siparişin stoğunu ayırır — **iki ödeme yolunun ortak adımı**.
 *
 * Ayırma iki yerde birden gerekiyor ve sırası ödeme yöntemine bağlı (ORDER_LIFECYCLE):
 *   online       → checkout BAŞLARKEN, sipariş hâlâ `draft`; ayırma TTL'li, ödeme gelmezse düşer.
 *   kapıda/vadeli → `confirmed` geçişinde; **TTL YOK**, çünkü beklenen bir ödeme penceresi yok —
 *                   sipariş kesinleşti, mal teslime kadar ayrılmış kalır.
 *
 * Döngü ikinci kez yazılmasın diye burada: yarıda kalan ayırmaların geri bırakılması ("ya hepsi ya
 * hiçbiri") kolay unutulan bir ayrıntı ve iki kopyanın biri onu unuttuğunda stok sessizce kilitli
 * kalırdı.
 */
type ReserveOutcome = { ok: true; expiresAt: string | null } | { ok: false; variantId: string; available: number };

interface ReserveOrderInput {
  orderId: string;
  items: readonly Pick<OrderItem, 'variantId' | 'qty' | 'stockId'>[];
  /**
   * Ayırma süresi dolsun mu. `true` → ayarın TTL'i (online ödeme penceresi), `false` → süresiz
   * (kapıda/vadeli). Varsayılan yok: çağıran bu kararı bilerek vermeli.
   */
  expiring: boolean;
}

export async function reserveOrderStock(input: ReserveOrderInput): Promise<ReserveOutcome> {
  const db = serviceDb();
  const ttlMinutes = input.expiring ? await new SettingsService(db).getNumber('reservation_ttl_minutes', 30) : null;
  const reservations = new ReservationService(db);

  for (const item of input.items) {
    const result = await reservations.reserve({
      orderId: input.orderId,
      variantId: item.variantId,
      qty: item.qty,
      ttlMinutes: ttlMinutes ?? undefined,
      stockId: item.stockId,
    });
    if (!result.ok) {
      // Yarıda kalan ayırmalar geri bırakılır — bu siparişe ait olduğu için toplu silmek güvenli.
      await reservations.releaseByOrder(input.orderId);
      return { ok: false, variantId: item.variantId, available: result.available };
    }
  }

  return { ok: true, expiresAt: ttlMinutes === null ? null : new Date(Date.now() + ttlMinutes * 60_000).toISOString() };
}
