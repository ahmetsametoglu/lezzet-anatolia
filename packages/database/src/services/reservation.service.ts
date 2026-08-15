import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ReservationSchema,
  ReservationInsertSchema,
  ReservationUpdateSchema,
  ReserveResultSchema,
  type Reservation,
  type ReservationInsert,
  type ReservationUpdate,
  type ReserveResult,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/** `reserve_stock` RPC'sinin girdisi — karar (TTL süresi, çıpalanacak parti) çağırandan gelir. */
export interface ReserveInput {
  orderId: string;
  variantId: string;
  /**
   * Hangi depodan ayrılıyor (DOMAIN §17) — zorunlu ve varsayılansız. Süzgeç unutulsaydı sistem
   * başka şehirdeki malı ayırır, yani OLMAYAN MALI SATARDI; üstelik tek depolu bir veri setinde
   * hiçbir test bunu kırmazdı. Siparişin deposuyla eşitliği DB kısıtı tutar.
   */
  warehouseId: string;
  qty: number;
  /** Online checkout TTL'i (dk). Kapıda/vadeli rezervasyonda verilmez → süresiz. */
  ttlMinutes?: number | null;
  /** Near-expiry teklif satırı → rezervasyon o partiye çıpalanır. */
  stockId?: string | null;
}

/**
 * Rezervasyon servisi (06.3/06.4). "Ayrılmış toplam" hiçbir yerde saklanmaz — bu tablodaki
 * satırlardan türetilir (DATA_MODEL kalıcı kararlar).
 *
 * **Ayırma bu servisin sorgu kurucusundan geçmez**, `reserve_stock` RPC'sine gider: kontrol ile
 * yazım aynı transaction'da kilitli olmalıdır, yoksa iki müşteri son birimi birlikte ayırır
 * (STACK §13 yazma eşiği). Serbest bırakma ve süpürme tek tablodur → düz servis.
 *
 * `insert` mirası bilerek KAPATILMADI ama kullanılmamalıdır: doğrudan satır yazmak yarış kapısını
 * geri açar. Tek meşru yazım yolu `reserve()`.
 */
export class ReservationService extends BaseDbService<Reservation, ReservationInsert, ReservationUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'reservation', ReservationSchema, ReservationInsertSchema, ReservationUpdateSchema);
  }

  /**
   * **Atomik ayırma.** Yetmezse satır yazılmaz; `ok=false` ve o anki kullanılabilir döner —
   * kısmi ayırma yoktur (DOMAIN §4). Çağıran cevabı müşteriye o an gösterir.
   */
  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const raw = await this.executeRpc('reserve_stock', {
      p_order_id: input.orderId,
      p_variant_id: input.variantId,
      p_warehouse_id: input.warehouseId,
      p_qty: input.qty,
      p_ttl_minutes: input.ttlMinutes ?? null,
      p_stock_id: input.stockId ?? null,
    });
    return ReserveResultSchema.parse(dbToApp(raw));
  }

  /** Siparişin aktif rezervasyonları (süresi dolmuş satır sayılmaz). */
  async listActiveByOrder(orderId: string): Promise<Reservation[]> {
    return this.getAll({ orderId }, { orFilters: [`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`] });
  }

  /** Varyantın aktif rezervasyonları — kullanılabilir hesabının parti kırılımı gerektiğinde. */
  async listActiveByVariant(variantId: string): Promise<Reservation[]> {
    return this.getAll({ variantId }, { orFilters: [`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`] });
  }

  /**
   * **"Ayrılmış" mal hangi siparişe ayrılmış** — varyantın aktif rezervasyonları, DEPO süzgeçli (22.31).
   *
   * Ekranda "1 ayrılmış" yazıyordu ve neye ayrıldığı hiçbir yerde yazmıyordu (kullanıcı tespiti
   * 14.08). Ayrılmış mal depoda DURUYOR ama satılamaz; sayının kime ait olduğu görünmezse operatör
   * ya "kayıp" sanır ya da elle aramaya çıkar.
   *
   * **Sipariş künyesi BURADA gelmiyor ve gelemez:** `order_id`nin FK'sı YOK — tablo 0006'da açıldı,
   * `order` ise 07'de (kolonun kendi künyesi bunu yazıyor). FK olmadan PostgREST gömülü okuma
   * kuramıyor ve denemek `PGRST200` ile dönüyor (ölçüldü 14.08). Numarayı çağıran ikinci ve TEK bir
   * turda çözüyor (`OrderService.listByIds`) — `created_by` isimlerinin çözüldüğü desenin aynısı.
   */
  async listActiveByVariantScoped(
    variantId: string,
    warehouseIds: readonly string[] | undefined,
  ): Promise<Reservation[]> {
    if (warehouseIds?.length === 0) return [];
    const filters: Record<string, unknown> = { variantId };
    if (warehouseIds) filters.warehouseId = [...warehouseIds];
    return this.getAll(filters, { orFilters: [`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`] });
  }

  /**
   * Siparişin rezervasyonlarını serbest bırakır — iptalde ve teslimde çağrılır. Teslimde ayrıca
   * fiili stok düşer; o iki-tablolu yazım teslim RPC'sindedir (modül 07), burada değil.
   */
  async releaseByOrder(orderId: string): Promise<void> {
    return this.deleteWhere({ orderId });
  }

  /**
   * **TTL süpürme** (06.4): süresi geçmiş rezervasyonları geri bırakır. Taramalıdır — kaçan tik
   * sonraki taramada telafi olur; ikinci tarama no-op'tur (idempotent, STACK §13 cron disiplini).
   * Silinen satır sayısını döner (cron logu bunu yazar).
   */
  async sweepExpired(now: Date = new Date()): Promise<number> {
    const { data, error } = await this.supabase
      .from('reservation')
      .delete()
      .not('expires_at', 'is', null)
      .lte('expires_at', now.toISOString())
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }
}
