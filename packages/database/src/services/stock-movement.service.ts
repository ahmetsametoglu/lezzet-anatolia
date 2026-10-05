import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AdjustBatchResultSchema,
  AdjustResultSchema,
  StockMovementDetailRowSchema,
  StockMovementSchema,
  StockMovementInsertSchema,
  StockMovementUpdateSchema,
  DEFAULT_PAGE_SIZE,
  type AdjustBatchResult,
  type AdjustResult,
  type KeysetCursor,
  type Page,
  type StockDirection,
  type StockMovement,
  type StockMovementDetail,
  type StockMovementDetailRow,
  type StockMovementInsert,
  type StockMovementKind,
  type StockMovementUpdate,
  type StockWriteOffReason,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { rpcMoneyToCents } from '../utils/rpc-money';

import { dbToApp } from '../utils/case-transformers';

/**
 * Dönem süzgeci `occurred_at`e bakar, `created_at`e değil: "bu çeyrekte ne çıktı" fiziksel bir sorudur ve cevabı olayın anıdır,
 * `created_at` ise kaydın yazıldığı anı ve defterin sırasını verir; geriye dönük yazılan kayıt öbürüyle yazıldığı döneme düşerdi.
 */
function periodFilters(from?: Date, to?: Date) {
  const filters: Array<{ field: string; operator: 'gte' | 'lte'; value: string }> = [];
  if (from) filters.push({ field: 'occurred_at', operator: 'gte', value: from.toISOString() });
  if (to) filters.push({ field: 'occurred_at', operator: 'lte', value: to.toISOString() });
  return filters;
}

export interface AdjustInput {
  stockId: string;
  /** DAİMA pozitif — yön `direction`'da. */
  qty: number;
  direction: StockDirection;
  /** Bu kapı yalnız elle düzeltme yazar: `write_off` · `count_diff` · `return_restock`. */
  kind: Extract<StockMovementKind, 'write_off' | 'count_diff' | 'return_restock'>;
  /** Yalnız `write_off`ta — veride kısıt zorluyor. */
  reason?: StockWriteOffReason | null;
  /** `in` yönünde ZORUNLU — istisnanın sebebi yazılmadan stok artmaz. */
  note?: string | null;
  createdBy?: string | null;
  /** İade restokunda hangi sipariş (isteğe bağlı iz). */
  orderId?: string | null;
}

/** Özetin bir kalemi — adet ve maliyet, ikisi de tek yönde ve pozitif. */
export interface MovementTotal {
  qty: number;
  costCents: number;
}

/**
 * Stok hareket defteri, miktar değiştiren her olayın tek kaydı: satış, kapı satışı, sevk, imha, sayım ve iade hepsi burada. Yazma yolu
 * yoktur, satırlar yalnız RPC'lerden doğar, çünkü hareket kaydı ile stoğun değişmesi bölünemez bir yazımdır (`adjust`/`adjustBatch`).
 */
export class StockMovementService extends BaseDbService<StockMovement, StockMovementInsert, StockMovementUpdate> {
  /** Kolon `stock_movement.unit_cost` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['unitCostCents'];

  constructor(supabase: SupabaseClient) {
    // Silme de kapalı: defter yalnız eklenir, iptal ters kayıtla yapılır (`reverses_id`). Test artığını purge'ün ham silmesi toplar.
    super(supabase, 'stock_movement', StockMovementSchema, StockMovementInsertSchema, StockMovementUpdateSchema, false);
  }

  /** Elle düzeltme yazar ve partinin fiilisini aynı transaction'da günceller. */
  async adjust(input: AdjustInput): Promise<AdjustResult> {
    const raw = await this.executeRpc('adjust_stock', {
      p_stock_id: input.stockId,
      p_qty: input.qty,
      p_direction: input.direction,
      p_kind: input.kind,
      p_reason: input.reason ?? null,
      p_note: input.note ?? null,
      p_created_by: input.createdBy ?? null,
      p_order_id: input.orderId ?? null,
    });
    return AdjustResultSchema.parse(dbToApp(raw));
  }

  /**
   * Çok partili tek olay: N satır ve paylaşılan belge numarası bölünmeden yazılır, `adjust()`'ı N kez çağırmak bir satır düşünce yarım
   * tutanak bırakırdı. Yön satır başınadır, çünkü tek sayım tutanağında hem fazla hem eksik satır olabilir; tip olaya aittir.
   */
  async adjustBatch(input: {
    lines: ReadonlyArray<{ stockId: string; qty: number; direction: StockDirection }>;
    kind: Extract<StockMovementKind, 'write_off' | 'count_diff' | 'return_restock'>;
    prefix: string;
    reason?: StockWriteOffReason | null;
    note?: string | null;
    createdBy?: string | null;
  }): Promise<AdjustBatchResult> {
    const raw = await this.executeRpc('adjust_stock_batch', {
      p_lines: input.lines.map((line) => ({ stock_id: line.stockId, qty: line.qty, direction: line.direction })),
      p_kind: input.kind,
      p_prefix: input.prefix,
      p_reason: input.reason ?? null,
      p_note: input.note ?? null,
      p_created_by: input.createdBy ?? null,
    });
    // RPC dönüşü bir TABLO SATIRI değil (jsonb) — `moneyFields` yolundan geçmez; dönüşüm bu sınırda
    // ve ortak yardımcıyla (`rpcMoneyToCents`), her serviste yeniden yazılmasın diye.
    return AdjustBatchResultSchema.parse(rpcMoneyToCents(dbToApp(raw), ['outCost', 'inCost']));
  }

  /** Bir olayın bütün satırları — "elimdeki kâğıdın karşılığı" araması. */
  listByReference(referenceNo: string): Promise<StockMovement[]> {
    return this.getAll({ referenceNo }, { orderBy: 'createdAt' });
  }

  /** Bir partinin hareket geçmişi — en yeni önce. */
  async listByStock(stockId: string): Promise<StockMovement[]> {
    return this.getAll({ stockId }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Birden çok partinin hareketleri tek turda: ürün geçmişi paneli parti başına sorar ve satır başına sorgu N+1 olurdu
   * (`stock_movement_stock_idx`).
   */
  async listByStocks(stockIds: readonly string[]): Promise<StockMovement[]> {
    if (stockIds.length === 0) return [];
    return this.getAll({ stockId: [...stockIds] }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Transferlerin hareketleri, `transfer_id` taşıyan satırlar; kapanmış sevkiyat listesi eksik beyanının imha belgesini buradan okur.
   * Transfer kaydına ikinci bir kolon açılmadı, çünkü belge zaten defterde ve iki yerde tutulan numara bir gün ayrışırdı.
   */
  async listByTransferIds(
    transferIds: readonly string[],
    opts: { kind?: StockMovement['kind'] } = {},
  ): Promise<StockMovement[]> {
    if (transferIds.length === 0) return [];
    const filters: Record<string, unknown> = { transferId: [...transferIds] };
    if (opts.kind) filters.kind = opts.kind;
    return this.getAll(filters, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * Varyantın çıkışları, hangi partiden ne zaman ne kadar mal gittiği: satır mal fiilen çıkınca doğar ve kendi anını taşır, `kind` satışı
   * sevkten ayırır. Tarih süzgeci yoktur, çünkü "bu ürün hiç satıldı mı" sorusu bir pencereyle sınırlanamaz; pencere hesabın işidir.
   */
  async exitsByVariant(
    variantId: string,
  ): Promise<Array<{ stockId: string; qty: number; at: string; kind: StockMovementKind }>> {
    const { data, error } = await this.supabase
      .from('stock_movement')
      .select('stock_id,qty,occurred_at,kind,stock:stock!inner(variant_id)')
      .eq('direction', 'out')
      .eq('stock.variant_id', variantId);
    if (error) throw error;

    type Row = { stock_id: string; qty: number; occurred_at: string; kind: StockMovementKind };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      stockId: row.stock_id,
      qty: row.qty,
      at: row.occurred_at,
      kind: row.kind,
    }));
  }

  /**
   * Defter sayfası, hareket ile partisi ve ürünü: defter sınırsız büyüdüğü için keyset sayfalıdır ve adlar görünümden gelir. `direction`
   * sekmeyi seçer (çıkışlar `out`, mal kabul `in`); verilmezse ikisi birden, bir partinin tam geçmişi böyle okunur.
   */
  listRecent(
    opts: {
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: KeysetCursor;
      query?: string;
      warehouseIds?: readonly string[];
      direction?: StockDirection;
    } = {},
  ): Promise<Page<StockMovementDetail>> {
    return new StockMovementDetailService(this.supabase).listPage(opts);
  }

  /**
   * Dönemin tip ve sebep dağılımı ile toplamı: sayfalı liste dönemin toplamını veremez, o yüzden ayrı ve dar bir okumadır. Toplam
   * çağıranın seçtiği yönün içindedir ve hep pozitiftir; `byReason` yalnız `write_off` satırlarını kırar.
   */
  async summary(
    opts: { from?: Date; to?: Date; warehouseIds?: readonly string[]; direction?: StockDirection } = {},
  ): Promise<{
    byKind: Map<StockMovementKind, MovementTotal>;
    byReason: Map<StockWriteOffReason, MovementTotal>;
    qty: number;
    costCents: number;
  }> {
    const empty = {
      byKind: new Map<StockMovementKind, MovementTotal>(),
      byReason: new Map<StockWriteOffReason, MovementTotal>(),
      qty: 0,
      costCents: 0,
    };
    // Boş dizi "hiçbiri" (`listPage` ile aynı sözleşme) — sorgu bile atılmaz.
    if (opts.warehouseIds?.length === 0) return empty;

    let query = this.supabase.from('stock_movement').select('kind,reason,qty,unit_cost');
    if (opts.from) query = query.gte('occurred_at', opts.from.toISOString());
    if (opts.to) query = query.lte('occurred_at', opts.to.toISOString());
    if (opts.warehouseIds) query = query.in('warehouse_id', [...opts.warehouseIds]);
    if (opts.direction) query = query.eq('direction', opts.direction);
    const { data, error } = await query;
    if (error) throw error;

    type Row = { kind: StockMovementKind; reason: StockWriteOffReason | null; qty: number; unit_cost: string | number | null };
    const byKind = new Map<StockMovementKind, MovementTotal>();
    const byReason = new Map<StockWriteOffReason, MovementTotal>();
    let qty = 0;
    let costCents = 0;
    for (const row of (data ?? []) as unknown as Row[]) {
      // Maliyet euro cinsinden numeric; para tamsayı cent'te taşınır (STACK §8). `qty` pozitif
      // olduğu için toplam da pozitif — işaret yönde, sayıda değil.
      const rowCost = Math.round(Number(row.unit_cost ?? 0) * 100) * row.qty;
      const kindEntry = byKind.get(row.kind) ?? { qty: 0, costCents: 0 };
      kindEntry.qty += row.qty;
      kindEntry.costCents += rowCost;
      byKind.set(row.kind, kindEntry);
      if (row.reason) {
        const reasonEntry = byReason.get(row.reason) ?? { qty: 0, costCents: 0 };
        reasonEntry.qty += row.qty;
        reasonEntry.costCents += rowCost;
        byReason.set(row.reason, reasonEntry);
      }
      qty += row.qty;
      costCents += rowCost;
    }
    return { byKind, byReason, qty, costCents };
  }

  /**
   * Dönemsel fire, varyant bazında adet ve maliyet (DOMAIN §12): yalnız `write_off` ve `count_diff` sayılır, iade restokunun karşılığı
   * `order_item_batch`ten, satış ve sevkin maliyeti COGS'tan zaten düşülür. Sayım fazlası (`in`) toplamı düşürür, kaybın telafisidir.
   */
  async lossSummary(from: Date, to: Date): Promise<Array<{ variantId: string; qty: number; costCents: number }>> {
    const { data, error } = await this.supabase
      .from('stock_movement')
      .select('direction,qty,unit_cost,stock:stock(variant_id)')
      .in('kind', ['write_off', 'count_diff'])
      .gte('occurred_at', from.toISOString())
      .lte('occurred_at', to.toISOString());
    if (error) throw error;

    type Row = {
      direction: StockDirection;
      qty: number;
      unit_cost: string | number | null;
      stock: { variant_id: string } | null;
    };
    const totals = new Map<string, { variantId: string; qty: number; costCents: number }>();
    for (const row of (data ?? []) as unknown as Row[]) {
      const variantId = row.stock?.variant_id;
      if (!variantId) continue;
      // Kayıp POZİTİF, telafi NEGATİF: işaret burada, okumanın sınırında kuruluyor — kolonda değil.
      const signed = row.direction === 'out' ? row.qty : -row.qty;
      const entry = totals.get(variantId) ?? { variantId, qty: 0, costCents: 0 };
      entry.qty += signed;
      // Maliyet euro cinsinden numeric; para tamsayı cent'te taşınır (STACK §8).
      entry.costCents += Math.round(Number(row.unit_cost ?? 0) * 100) * signed;
      totals.set(variantId, entry);
    }
    return [...totals.values()];
  }
}

/**
 * `stock_movement_detail` görünümü, defterin aranabilir okuması: arama lot numarasına ya da ürün adına bakar ve PostgREST'in `or=` grubu
 * gömülü kaynağa bakamadığı için görünüm tek bir `search_text` kolonu kurar. Görünüm düz kolon döndürür, burada `StockMovementDetail`e
 * eşlenir.
 */
export class StockMovementDetailService extends BaseDbService<StockMovementDetailRow, never, never> {
  /**
   * Görünüm de `unit_cost`'u euro taşır — beyan burada da gerekli. Şema entiteden türediği için
   * (`StockMovementSchema.extend`) alan adı `unitCostCents`; beyan olmasaydı projeksiyon euro
   * okuyup tamsayı bekleyen şemaya verirdi ve doğrulama patlardı.
   */
  protected override readonly moneyFields = ['unitCostCents'];

  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'stock_movement_detail',
      StockMovementDetailRowSchema,
      StockMovementDetailRowSchema as never,
      StockMovementDetailRowSchema as never,
      false,
    );
  }

  /**
   * `warehouseIds` sunucuda süzülür, çünkü keyset'li sayfada bellekte süzmek sonraki sayfaları sessizce eksik getirirdi. Verilmezse süzgeç
   * yoktur, boş dizi "hiçbiri" demektir: kapsamı boş personele bütün depoları göstermek süzgecin var oluş sebebini tersine çevirirdi.
   */
  async listPage(
    opts: {
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: KeysetCursor;
      query?: string;
      warehouseIds?: readonly string[];
      direction?: StockDirection;
    } = {},
  ): Promise<Page<StockMovementDetail>> {
    if (opts.warehouseIds?.length === 0) return { rows: [], nextCursor: null };
    const term = opts.query?.trim();
    const page = await this.getPageAs(
      StockMovementDetailRowSchema,
      {
        warehouseId: opts.warehouseIds ? [...opts.warehouseIds] : undefined,
        direction: opts.direction,
      },
      {
        // `search_text` seçilmiyor: süzgeç sunucuda çalışıyor, metnin kendisi ekrana taşınmıyor.
        select:
          'id,stock_id,warehouse_id,direction,qty,kind,reason,unit_cost,occurred_at,created_at,actor_id,note,reference_no,order_id,transfer_id,intake_id,reverses_id,lot_number,expiry_date,variant_id,variant_label,product_id,product_name',
        rangeFilters: periodFilters(opts.from, opts.to),
        ...(term ? { searchFilters: [{ field: 'searchText', query: term }] } : {}),
        orderBy: 'createdAt',
        orderDirection: 'desc',
        limit: opts.limit ?? DEFAULT_PAGE_SIZE,
        keysetAfter: opts.cursor,
      },
    );
    return { ...page, rows: page.rows.map(toDetail) };
  }
}

/** Görünümün düz satırı → ekranın beklediği iç içe şekil. Tek yerde, iki okuma yolu yok. */
function toDetail(row: StockMovementDetailRow): StockMovementDetail {
  const { lotNumber, expiryDate, variantId, variantLabel, productId, productName, ...movement } = row;
  return {
    ...movement,
    stock: {
      id: row.stockId,
      lotNumber,
      expiryDate,
      variant: { id: variantId, label: variantLabel, product: { id: productId, name: productName } },
    },
  };
}
