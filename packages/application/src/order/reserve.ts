import { OrderService, ReservationService, SettingsService, type Db } from '@lezzet/database';
import type { OrderItem } from '@lezzet/types';
import { notifyStockLowAfterReserve } from '../notification/staff-events';

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
 *
 * ── TERFİ (aşama 2/3) · WEB'DEN FARKI ────────────────────────────────────────
 * Kaynağı `apps/web/lib/order/reserve.ts`tı; web kopyası KÖPRÜ olarak duruyor. Tek fark `db`nin
 * çağırandan gelmesi (`serviceDb()` içeride çağrılmıyor) — paketin ortak deseni. "Ya hepsi ya
 * hiçbiri" döngüsü, TTL kararı ve deponun siparişten okunması aynen korundu.
 */
export type ReserveOutcome = { ok: true; expiresAt: string | null } | { ok: false; variantId: string; available: number };

export interface ReserveOrderInput {
  orderId: string;
  items: readonly Pick<OrderItem, 'variantId' | 'qty' | 'stockId'>[];
  /**
   * Ayırma süresi dolsun mu. `true` → ayarın TTL'i (online ödeme penceresi), `false` → süresiz
   * (kapıda/vadeli). Varsayılan yok: çağıran bu kararı bilerek vermeli.
   */
  expiring: boolean;
}

export async function reserveOrderStock(db: Db, input: ReserveOrderInput): Promise<ReserveOutcome> {
  // Ayırma SİPARİŞİN deposundan yapılır (DOMAIN §17) — ayrıca sorulmaz, siparişten okunur:
  // ikinci bir kaynak, iki kaynağın ayrışabileceği anlamına gelirdi. DB kısıtı da eşitliği tutar.
  const order = await new OrderService(db).getById(input.orderId);
  if (!order) throw new Error(`[reserve] sipariş bulunamadı: ${input.orderId}`);
  const ttlMinutes = input.expiring ? await new SettingsService(db).getNumber('reservation_ttl_minutes', 30) : null;
  const reservations = new ReservationService(db);

  for (const item of input.items) {
    const result = await reservations.reserve({
      orderId: input.orderId,
      variantId: item.variantId,
      warehouseId: order.warehouseId,
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

  // EŞİK ZİLİ (26.08): ayırma kullanılabilir stoğu düşürdü — dokunulan varyantlar eşiğin altına
  // İNDİYSE depo+yönetim haber alır (üretici sessiz-künyeli, dedupe "ilk iniş"; künyesi orada).
  await notifyStockLowAfterReserve(db, {
    warehouseId: order.warehouseId,
    variantIds: [...new Set(input.items.map((item) => item.variantId))],
  });

  return { ok: true, expiresAt: ttlMinutes === null ? null : new Date(Date.now() + ttlMinutes * 60_000).toISOString() };
}
