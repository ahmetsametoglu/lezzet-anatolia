import { OrderService, ReservationService, SettingsService, type Db } from '@lezzet/database';
import type { Order, OrderItem } from '@lezzet/types';
import { notifyStockLowAfterReserve } from '../notification/staff-events';
import type { BackgroundRunner } from './effects';

/**
 * Siparişin stoğunu ayırır, iki ödeme yolunun ortak adımı: online ödemede checkout başlarken ve süreli (ödeme gelmezse düşer),
 * kapıda/vadelide `confirmed` geçişinde ve süresiz (ORDER_LIFECYCLE). Yarıda kalan ayırmaların geri bırakılması burada tek yerde
 * durur, çünkü iki kopyadan biri onu unutsaydı stok sessizce kilitli kalırdı.
 */
export type ReserveOutcome = { ok: true; expiresAt: string | null } | { ok: false; variantId: string; available: number };

export interface ReserveOrderInput {
  orderId: string;
  items: readonly Pick<OrderItem, 'variantId' | 'qty' | 'stockId'>[];
  /**
   * Ayırma süresi dolsun mu: `true` ayarın TTL'i (online ödeme penceresi), `false` süresiz (kapıda/vadeli). Varsayılan yok, çağıran bu
   * kararı bilerek vermeli.
   */
  expiring: boolean;
  /** Bu istekte zaten okunmuş sipariş satırı; depo yine siparişten gelir, yalnız yeniden okunmaz. */
  order?: Pick<Order, 'warehouseId'>;
  /** Stok eşiği uyarısını yanıttan sonra koşturan kapı; verilmezse uyarı beklenir. */
  runLater?: BackgroundRunner;
}

export async function reserveOrderStock(db: Db, input: ReserveOrderInput): Promise<ReserveOutcome> {
  // Ayırma SİPARİŞİN deposundan yapılır (DOMAIN §17) — ayrıca sorulmaz, siparişten okunur:
  // ikinci bir kaynak, iki kaynağın ayrışabileceği anlamına gelirdi. DB kısıtı da eşitliği tutar.
  const order = input.order ?? (await new OrderService(db).getById(input.orderId));
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

  // Eşik zili: ayırma kullanılabilir stoğu düşürdü; dokunulan varyantlar eşiğin altına indiyse depo ve yönetim haber alır (tekrarı
  // üretici önler). Uyarı müşteriyi bekletmesin diye kapı verildiyse yanıttan sonra koşar; hatasını üretici kendisi yakalar.
  const alert = () =>
    notifyStockLowAfterReserve(db, {
      warehouseId: order.warehouseId,
      variantIds: [...new Set(input.items.map((item) => item.variantId))],
    });
  if (input.runLater) input.runLater(alert);
  else await alert();

  return { ok: true, expiresAt: ttlMinutes === null ? null : new Date(Date.now() + ttlMinutes * 60_000).toISOString() };
}
