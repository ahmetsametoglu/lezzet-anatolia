import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ReceiveIntakeResultSchema,
  StockIntakeSchema,
  StockIntakeInsertSchema,
  StockIntakeUpdateSchema,
  type IntakeLine,
  type ReceiveIntakeResult,
  type StockIntake,
  type StockIntakeInsert,
  type StockIntakeUpdate,
} from '@lezzet/types';
import { fromCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { appToDb, dbToApp } from '../utils/case-transformers';
import { rpcMoneyToCents } from '../utils/rpc-money';

export interface ReceiveIntakeInput {
  supplierId?: string | null;
  /**
   * **Mal hangi depoya girdi** (K6) — zorunlu. Satın alma siparişi depo-üstüdür ama mal fiziksel
   * olarak bir kapıdan girer; depo bağı PO'ya değil bu kabule takılır. Aynı PO'nun ikinci kabulü
   * başka depoda olabilir ve sipariş ancak hepsi geldiğinde kapanır.
   */
  warehouseId: string;
  /** Bağlı tedarik siparişi; PO'suz doğrudan giriş de mümkündür (küçük/plansız alım). */
  purchaseOrderId?: string | null;
  lines: IntakeLine[];
  date?: string;
  note?: string | null;
}

/**
 * Mal kabul (06.10) — DOMAIN §16. Alımın envanter tarafı: gelen mal partilere dönüşür.
 *
 * Yazım `receive_intake` RPC'sinden geçer: giriş kaydı + partiler + PO kapanışı + son alış fiyatı
 * BÖLÜNEMEZ (STACK §13). Yarısı yazılırsa "partiler girdi ama sipariş açık kaldı" gibi elle
 * düzeltilecek tutarsızlık doğar.
 *
 * MLOR uyarısı burada hesaplanmaz — o motorun işi (`domain-core/stock/shelf-life.meetsMlor`) ve
 * kabulü **engellemez**, uyarır: karar mal kabul edende (DOMAIN §4).
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
      p_date: input.date ?? new Date().toISOString().slice(0, 10),
      p_note: input.note ?? null,
    });
    // RPC dönüşü bir TABLO SATIRI değil (jsonb) — `moneyFields` yolundan geçmez; dönüşüm bu sınırda
    // ve ortak yardımcıyla (`rpcMoneyToCents`), her serviste yeniden yazılmasın diye.
    return ReceiveIntakeResultSchema.parse(rpcMoneyToCents(dbToApp(raw), ['totalAmount']));
  }

  async listBySupplier(supplierId: string): Promise<StockIntake[]> {
    return this.getAll({ supplierId }, { orderBy: 'date', orderDirection: 'desc' });
  }

  /**
   * **Sipariş ↔ gelen mal farkı:** PO kalemleriyle o siparişten giren partiler karşılaştırılır.
   * Eksik gelen mal sessizce kaybolmaz — zincirin görünür halkası budur (DOMAIN §16).
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
