import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AdjustBatchResultSchema,
  AdjustResultSchema,
  StockAdjustmentDetailSchema,
  StockAdjustmentSchema,
  StockAdjustmentInsertSchema,
  StockAdjustmentUpdateSchema,
  DEFAULT_PAGE_SIZE,
  type AdjustBatchResult,
  type AdjustResult,
  type KeysetCursor,
  type Page,
  type StockAdjustment,
  type StockAdjustmentDetail,
  type StockAdjustmentInsert,
  type StockAdjustmentReason,
  type StockAdjustmentUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

import { dbToApp } from '../utils/case-transformers';

/** Kayıt + hangi partinin, hangi ürünün — iki okumanın paylaştığı gömülü seçim. */
const DETAIL_SELECT =
  '*,stock:stock(id,lot_number,expiry_date,variant:product_variant(id,label,product:product(id,name)))';

/** Dönem süzgeci — verilmeyen uç sınırsızdır ("Tümü" iki ucu da vermez). */
function periodFilters(from?: Date, to?: Date) {
  const filters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
  if (from) filters.push({ field: 'created_at', operator: 'gte', value: from.toISOString() });
  if (to) filters.push({ field: 'created_at', operator: 'lte', value: to.toISOString() });
  return filters;
}

export interface AdjustInput {
  stockId: string;
  /** + stoktan düşüm (imha/fire/kayıp), − stoğa geri ekleme (sayım fazlası, iade restoku). */
  qty: number;
  reason: StockAdjustmentReason;
  /** Geri eklemede ZORUNLU — istisnanın sebebi yazılmadan stok artmaz. */
  note?: string | null;
  createdBy?: string | null;
}

/**
 * Stok düzeltmesi (06.6) — imha / fire / sayım farkı / iade restoku. DOMAIN §4, §12.
 *
 * Yazım `adjust_stock` RPC'sinden geçer: kayıt + partinin fiili düşümü bölünemez (STACK §13).
 * Doğrudan `insert` çağrılırsa kayıt yazılır ama stok düşmez — o yüzden tek meşru yol `adjust()`.
 */
export class StockAdjustmentService extends BaseDbService<StockAdjustment, StockAdjustmentInsert, StockAdjustmentUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'stock_adjustment', StockAdjustmentSchema, StockAdjustmentInsertSchema, StockAdjustmentUpdateSchema);
  }

  /** Düzeltme yazar ve partinin fiilisini aynı transaction'da günceller. */
  async adjust(input: AdjustInput): Promise<AdjustResult> {
    const raw = await this.executeRpc('adjust_stock', {
      p_stock_id: input.stockId,
      p_qty: input.qty,
      p_reason: input.reason,
      p_note: input.note ?? null,
      p_created_by: input.createdBy ?? null,
    });
    return AdjustResultSchema.parse(dbToApp(raw));
  }

  /**
   * **Çok partili tek olay** (10.5): N satır + PAYLAŞILAN bir belge numarası, hepsi bölünemez.
   *
   * `adjust()`'ı N kez çağırmak aynı şey değildir: üçüncü satır düştüğünde elde yarım bir tutanak
   * kalır ve kâğıtla eşleşmez. Öneki motor seçer (`documentPrefixFor`), numarayı DB üretir.
   */
  async adjustBatch(input: {
    lines: ReadonlyArray<{ stockId: string; qty: number }>;
    reason: StockAdjustmentReason;
    prefix: string;
    note?: string | null;
    createdBy?: string | null;
  }): Promise<AdjustBatchResult> {
    const raw = await this.executeRpc('adjust_stock_batch', {
      p_lines: input.lines.map((line) => ({ stock_id: line.stockId, qty: line.qty })),
      p_reason: input.reason,
      p_prefix: input.prefix,
      p_note: input.note ?? null,
      p_created_by: input.createdBy ?? null,
    });
    return AdjustBatchResultSchema.parse(dbToApp(raw));
  }

  /** Bir olayın bütün satırları — "elimdeki kâğıdın karşılığı" araması. */
  listByReference(referenceNo: string): Promise<StockAdjustment[]> {
    return this.getAll({ referenceNo }, { orderBy: 'createdAt' });
  }

  /** Bir partinin düzeltme geçmişi — en yeni önce. */
  async listByStock(stockId: string): Promise<StockAdjustment[]> {
    return this.getAll({ stockId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * İmha/fire geçmişi SAYFASI — kayıt + hangi partinin, hangi ürünün (09.13).
   *
   * Hareket kaydı zamanla **sınırsız** büyür (CLAUDE.md: veriyle büyüyen küme) → keyset sayfalama.
   * Ürün/parti adları gömülü `select` ile aynı turda gelir; satır başına ürün sorgusu (N+1) bir
   * geçmiş listesinde en pahalı hatadır, çünkü satır sayısı zaten büyüktür.
   *
   * Ayrıntılı analiz burada DEĞİL (raporlar, DOMAIN §12): bu liste "ne oldu" sorusunu yanıtlar,
   * `lossSummary` ise "ne kadar" sorusunu.
   */
  async listRecent(opts: { from?: Date; to?: Date; limit?: number; cursor?: KeysetCursor } = {}): Promise<Page<StockAdjustmentDetail>> {
    return this.getPageAs(StockAdjustmentDetailSchema, undefined, {
      select: DETAIL_SELECT,
      rangeFilters: periodFilters(opts.from, opts.to),
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
    });
  }

  /**
   * Dönemin SEBEP DAĞILIMI ve toplamı — "bu çeyrek ne kadar çöpe gitti, neden".
   *
   * Sayfalı liste bu soruyu yanıtlayamaz: ilk 30 satır dönemin toplamı değildir. Toplam ancak dönemin
   * TAMAMI üzerinden çıkar, o yüzden ayrı ve DAR bir okuma — üç kolon (`reason, qty, unit_cost`),
   * satırın kalanı taşınmaz.
   *
   * RPC YAZILMADI: tek tablo üzerinde toplama, STACK §13'ün "çok tablolu + farkı bariz" eşiğini
   * karşılamıyor. Dönem seçicisi de yükü sınırlıyor. "Tümü" seçildiğinde okuma geçmişle büyür —
   * ölçülüp gerekirse RPC'ye alınır; bugün ölçüsüz bir migration yazmak erken karar olurdu.
   */
  async reasonSummary(from?: Date, to?: Date): Promise<{ byReason: Map<StockAdjustmentReason, { qty: number; costCents: number }>; qty: number; costCents: number }> {
    let query = this.supabase.from(this.tableName).select('reason,qty,unit_cost');
    if (from) query = query.gte('created_at', from.toISOString());
    if (to) query = query.lte('created_at', to.toISOString());
    const { data, error } = await query;
    if (error) throw error;

    type Row = { reason: StockAdjustmentReason; qty: number; unit_cost: string | number | null };
    const byReason = new Map<StockAdjustmentReason, { qty: number; costCents: number }>();
    let qty = 0;
    let costCents = 0;
    for (const row of (data ?? []) as unknown as Row[]) {
      // Maliyet euro cinsinden numeric; para tamsayı cent'te taşınır (STACK §8). İşaret KORUNUR:
      // geri ekleme (negatif) toplamdan düşer → rapor NET kaybı gösterir, şişmiş bir imha rakamı değil.
      const rowCost = Math.round(Number(row.unit_cost ?? 0) * 100) * row.qty;
      const entry = byReason.get(row.reason) ?? { qty: 0, costCents: 0 };
      entry.qty += row.qty;
      entry.costCents += rowCost;
      byReason.set(row.reason, entry);
      qty += row.qty;
      costCents += rowCost;
    }
    return { byReason, qty, costCents };
  }

  /**
   * Dönemsel fire toplamı — VARYANT bazında adet ve maliyet. Kayıp raporunun (DOMAIN §12) girdisi.
   * Geri eklemeler (negatif satırlar) toplamdan düşer: rapor **net** kaybı gösterir, şişmiş bir
   * "imha ettik" rakamı değil.
   */
  async lossSummary(from: Date, to: Date): Promise<Array<{ variantId: string; qty: number; costCents: number }>> {
    const { data, error } = await this.supabase
      .from('stock_adjustment')
      .select('qty,unit_cost,stock:stock(variant_id)')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString());
    if (error) throw error;

    type Row = { qty: number; unit_cost: string | number | null; stock: { variant_id: string } | null };
    const totals = new Map<string, { variantId: string; qty: number; costCents: number }>();
    for (const row of (data ?? []) as unknown as Row[]) {
      const variantId = row.stock?.variant_id;
      if (!variantId) continue;
      const entry = totals.get(variantId) ?? { variantId, qty: 0, costCents: 0 };
      entry.qty += row.qty;
      // Maliyet euro cinsinden numeric; para tamsayı cent'te taşınır (STACK §8).
      entry.costCents += Math.round(Number(row.unit_cost ?? 0) * 100) * row.qty;
      totals.set(variantId, entry);
    }
    return [...totals.values()];
  }
}
