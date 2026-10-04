import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PAGE_SIZE,
  ReceiveIntakeResultSchema,
  StockIntakeSchema,
  StockIntakeInsertSchema,
  StockIntakeUpdateSchema,
  type IntakeLine,
  type KeysetCursor,
  type Page,
  type ReceiveIntakeResult,
  type StockIntake,
  type StockIntakeInsert,
  type StockIntakeUpdate,
} from '@lezzet/types';
import { fromCents, parisDateOf } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { appToDb, dbToApp } from '../utils/case-transformers';
import { rpcMoneyToCents } from '../utils/rpc-money';

export interface ReceiveIntakeInput {
  supplierId?: string | null;
  /**
   * Malın girdiği depo; bağ siparişe değil kabule takılır, çünkü satın alma siparişi depo-üstüdür ve mal fiziksel olarak bir
   * kapıdan girer. Aynı siparişin ikinci kabulü başka depoda olabilir.
   */
  warehouseId: string;
  /** Bağlı tedarik siparişi; PO'suz doğrudan giriş de mümkündür (küçük/plansız alım). */
  purchaseOrderId?: string | null;
  lines: IntakeLine[];
  date?: string;
  note?: string | null;
  /**
   * Kabulü yapan personel (`user_profiles.id`), belgeye ve doğan her harekete yazılır. İsteğe bağlıdır, çünkü seed ve bakım
   * yolları aktörsüz yazar ve defter orada "bilinmiyor" der.
   */
  actorId?: string | null;
}

/**
 * Mal kabul (DOMAIN §16): yazım `receive_intake` RPC'sinden geçer, çünkü giriş kaydı, partiler, sipariş kapanışı ve son alış fiyatı
 * bölünemez. MLOR uyarısı burada hesaplanmaz ve kabulü engellemez, karar mal kabul edendedir (DOMAIN §4).
 */
export class StockIntakeService extends BaseDbService<StockIntake, StockIntakeInsert, StockIntakeUpdate> {
  /** Kolon `stock_intake.total_amount` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['totalAmountCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'stock_intake', StockIntakeSchema, StockIntakeInsertSchema, StockIntakeUpdateSchema);
  }

  /** Girişi, partileri ve PO kapanışını tek transaction'da yazar. */
  async receive(input: ReceiveIntakeInput): Promise<ReceiveIntakeResult> {
    if (input.lines.length === 0) throw new Error('stock_intake: kalemsiz mal kabul yapılamaz');

    const raw = await this.executeRpc('receive_intake', {
      p_supplier_id: input.supplierId ?? null,
      p_warehouse_id: input.warehouseId,
      // ── PARA SINIRI: cent → euro, TEK NOKTADA ────────────────────────────────
      // `unit_cost` yayılarak yazılamaz: `appToDb` onu `unit_cost_cents` yapardı, RPC o anahtarı
      // hiç okumaz ve maliyet SESSİZCE düşerdi — parti fiyatsız doğar, hiçbir yerde hata patlamaz.
      // Alan bu yüzden çıkarılıp euro karşılığıyla ayrıca yazılıyor.
      p_lines: input.lines.map(({ unitCostCents, ...line }) => ({
        ...appToDb<Record<string, unknown>>(line),
        unit_cost: unitCostCents == null ? null : fromCents(unitCostCents),
      })),
      p_purchase_order_id: input.purchaseOrderId ?? null,
      p_date: input.date ?? parisDateOf(new Date()),
      p_note: input.note ?? null,
      p_actor_id: input.actorId ?? null,
    });
    // RPC dönüşü bir TABLO SATIRI değil (jsonb) — `moneyFields` yolundan geçmez; dönüşüm bu sınırda
    // ve ortak yardımcıyla (`rpcMoneyToCents`), her serviste yeniden yazılmasın diye.
    return ReceiveIntakeResultSchema.parse(rpcMoneyToCents(dbToApp(raw), ['totalAmount']));
  }

  async listBySupplier(supplierId: string): Promise<StockIntake[]> {
    return this.getAll({ supplierId }, { orderBy: 'date', orderDirection: 'desc' });
  }

  /**
   * Bir siparişin kabulleri: belge kapısı siparişin faturası girilirken kabullerden birinin faturası var mı diye sorar, varsa borç iki
   * kez yazılırdı. Sipariş başına doğal tavanlıdır (kısmi teslimler), tek turda okunur.
   */
  listByPurchaseOrder(purchaseOrderId: string): Promise<StockIntake[]> {
    return this.getAll({ purchaseOrderId }, { orderBy: 'date', orderDirection: 'desc' });
  }

  /**
   * Kabul edilen girişler keyset sayfalıdır, çünkü defter yalnız uzar; depo süzgeci sözleşmededir ve boş dizi "hiçbiri" demektir. Sıra
   * `created_at`tir, çünkü `date` geriye dönük yazılabilen irsaliye günüdür ve yeni kayıt listenin ortasına düşerdi.
   */
  async listRecent(
    opts: { warehouseIds?: readonly string[]; limit?: number; cursor?: KeysetCursor } = {},
  ): Promise<Page<StockIntake>> {
    if (opts.warehouseIds?.length === 0) return { rows: [], nextCursor: null };
    return this.getPage(
      { warehouseId: opts.warehouseIds ? [...opts.warehouseIds] : undefined },
      {
        orderBy: 'createdAt',
        orderDirection: 'desc',
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
        keysetAfter: opts.cursor,
      },
    );
  }

  /**
   * Sipariş kalemleri o siparişten giren partilerle karşılaştırılır, ki eksik gelen mal sessizce kaybolmasın (DOMAIN §16). Ham
   * `this.supabase` kullanılır, çünkü okuma bu servisin tablosunda değil iki ayrı tabloda ve dönen şey entity değil fark satırıdır.
   */
  async orderVsReceived(purchaseOrderId: string): Promise<Array<{ variantId: string; orderedQty: number; receivedQty: number; diff: number }>> {
    const [ordered, received] = await Promise.all([
      this.supabase.from('purchase_order_item').select('variant_id,qty').eq('purchase_order_id', purchaseOrderId),
      this.supabase.from('stock').select('variant_id,initial_qty,intake:stock_intake!inner(purchase_order_id)')
        .eq('stock_intake.purchase_order_id', purchaseOrderId),
    ]);
    if (ordered.error) throw ordered.error;
    if (received.error) throw received.error;

    const totals = new Map<string, { variantId: string; orderedQty: number; receivedQty: number }>();
    const entry = (variantId: string) => {
      const found = totals.get(variantId) ?? { variantId, orderedQty: 0, receivedQty: 0 };
      totals.set(variantId, found);
      return found;
    };
    for (const row of (ordered.data ?? []) as Array<{ variant_id: string; qty: number }>) {
      entry(row.variant_id).orderedQty += row.qty;
    }
    // GİRİŞ miktarı okunur, bugünkü fiili değil: parti satıldıkça erir, "gelen mal" rakamı erimez.
    for (const row of (received.data ?? []) as Array<{ variant_id: string; initial_qty: number }>) {
      entry(row.variant_id).receivedQty += row.initial_qty;
    }

    return [...totals.values()].map((row) => ({ ...row, diff: row.receivedQty - row.orderedQty }));
  }
}
