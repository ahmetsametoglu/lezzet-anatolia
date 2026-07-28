import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AdjustResultSchema,
  StockAdjustmentDetailSchema,
  StockAdjustmentSchema,
  StockAdjustmentInsertSchema,
  StockAdjustmentUpdateSchema,
  DEFAULT_PAGE_SIZE,
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
  async listRecent(opts: { limit?: number; cursor?: KeysetCursor } = {}): Promise<Page<StockAdjustmentDetail>> {
    return this.getPageAs(StockAdjustmentDetailSchema, undefined, {
      select: '*,stock:stock(id,lot_number,expiry_date,variant:product_variant(id,label,product:product(id,name)))',
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
    });
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
