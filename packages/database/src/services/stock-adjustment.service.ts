import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AdjustBatchResultSchema,
  AdjustResultSchema,
  StockAdjustmentDetailRowSchema,
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
  type StockAdjustmentDetailRow,
  type StockAdjustmentInsert,
  type StockAdjustmentReason,
  type StockAdjustmentUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { rpcMoneyToCents } from '../utils/rpc-money';

import { dbToApp } from '../utils/case-transformers';

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
  /** Kolon `stock_adjustment.unit_cost` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['unitCostCents'];

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
    // RPC dönüşü bir TABLO SATIRI değil (jsonb) — `moneyFields` yolundan geçmez; dönüşüm bu sınırda
    // ve ortak yardımcıyla (`rpcMoneyToCents`), her serviste yeniden yazılmasın diye.
    return AdjustBatchResultSchema.parse(rpcMoneyToCents(dbToApp(raw), ['costTotal']));
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
   * Birden çok partinin düzeltmeleri TEK turda (22.30) — ürün geçmişi paneli parti başına soruyor,
   * satır başına sorgu N+1 olurdu (`stock_adjustment_stock_idx`).
   */
  async listByStocks(stockIds: readonly string[]): Promise<StockAdjustment[]> {
    if (stockIds.length === 0) return [];
    return this.getAll({ stockId: [...stockIds] }, { orderBy: 'createdAt', orderDirection: 'desc' });
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
   *
   * **`warehouseIds` buradan da geçer** (operasyon notu 08.08 — "aynı sınıf bir açık olabilir;
   * ölçmedim, alan sizin"). Ölçüldü ve doğruydu: `listPage` depo süzgecini aldığı hâlde bu sarmal
   * onu SÖZLEŞMESİNE koymuyordu, yani stok ekranının imha geçmişi hâlâ bütün depoları gösteriyordu.
   * Tek depolu yerelde görünmeyen, çok depoluda depo değişmezini delen sessiz açık (`CLAUDE §1`).
   */
  listRecent(
    opts: {
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: KeysetCursor;
      query?: string;
      warehouseIds?: readonly string[];
    } = {},
  ): Promise<Page<StockAdjustmentDetail>> {
    return new StockAdjustmentDetailService(this.supabase).listPage(opts);
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
   *
   * ── OKUMA GÖRÜNÜMDEN, TABLODAN DEĞİL (22.28 turu) ───────────────────────────
   * Depo süzgeci eklenince kaynak da değişmek zorunda kaldı: `stock_adjustment`ta `warehouse_id`
   * YOK (depo partinin üstünde), `stock_adjustment_detail` görünümünde VAR — `listPage` zaten
   * oradan okuyor. Tabloda kalıp elde süzmek, dönemin TAMAMINI çekip bellekte elemek olurdu ve
   * "tümü" döneminde bu bütün geçmişi taşımak demek.
   *
   * **Süzgeçsiz toplam ile süzgeçli listenin yan yana durması sessiz bir yalandır:** başlık "bu
   * çeyrek 366 €" derken tablo yalnız bir deponun kayıtlarını gösterirse, operatör göremediği
   * satırların toplamını kendi deposuna yazar.
   */
  async reasonSummary(
    from?: Date,
    to?: Date,
    warehouseIds?: readonly string[],
  ): Promise<{ byReason: Map<StockAdjustmentReason, { qty: number; costCents: number }>; qty: number; costCents: number }> {
    const empty = { byReason: new Map<StockAdjustmentReason, { qty: number; costCents: number }>(), qty: 0, costCents: 0 };
    // Boş dizi "hiçbiri" (`listPage` ile aynı sözleşme) — sorgu bile atılmaz.
    if (warehouseIds?.length === 0) return empty;

    let query = this.supabase.from('stock_adjustment_detail').select('reason,qty,unit_cost');
    if (from) query = query.gte('created_at', from.toISOString());
    if (to) query = query.lte('created_at', to.toISOString());
    if (warehouseIds) query = query.in('warehouse_id', [...warehouseIds]);
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

/**
 * `stock_adjustment_detail` görünümü (09.18) — imha/fire listesinin ARANABİLİR okuması.
 *
 * Ayrı servis, çünkü görünüm yazılmaz (`never, never`) — ve çünkü aradaki fark bir okuma
 * ayrıntısı değil: liste artık gömülü `select` ile değil, birleşik bir görünümden geliyor.
 *
 * **Neden görünüm** (operasyon talebi §2): arama terimi lot numarasına VEYA ürün adına bakıyor;
 * ikisi iki ayrı gömülü kaynakta. PostgREST'in `or=` grubu yalnız üst tablonun kolonlarına bakar,
 * yani bu koşul sorgu kurucusuyla ifade edilemiyor (`STACK §13` istisnası). Görünümün içinde
 * kurulan tek bir `search_text` kolonu sorunu düz bir süzgece indiriyor ve keyset sayfalama bozulmuyor.
 *
 * **Ekranın gördüğü şekil DEĞİŞMİYOR:** görünüm düz kolon döndürür, burada iç içe
 * `StockAdjustmentDetail`'e eşlenir.
 */
export class StockAdjustmentDetailService extends BaseDbService<StockAdjustmentDetailRow, never, never> {
  /**
   * Görünüm de `unit_cost`'u euro taşır — beyan burada da gerekli. Şema entiteden türediği için
   * (`StockAdjustmentSchema.extend`) alan adı `unitCostCents`; beyan olmasaydı projeksiyon euro
   * okuyup tamsayı bekleyen şemaya verirdi ve doğrulama patlardı.
   */
  protected override readonly moneyFields = ['unitCostCents'];

  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'stock_adjustment_detail',
      StockAdjustmentDetailRowSchema,
      StockAdjustmentDetailRowSchema as never,
      StockAdjustmentDetailRowSchema as never,
      false,
    );
  }

  /**
   * **`warehouseIds` SUNUCUDA süzülür** (10.5 · operasyon talebi 08.08). Ekran geçici olarak bellekte
   * süzüyordu: sayfa okunuyor, satırların partileri ayrıca çekiliyor, yalnız o deponunkiler
   * kalıyordu. Çalışıyordu ama bedeli vardı — sayfa keyset'li, yani "30 satırın içindeki bu depo"
   * demek oluyordu ve sonraki sayfalar sessizce eksik geliyordu (`onlyShippable` ile aynı sınıf).
   *
   * **DİZİ, tekil değil** — sözleşme deponun her yerdeki sözleşmesiyle aynı (`StockService`,
   * `WarehouseService`): verilmezse süzgeç yok (depo-üstü okuma), verilirse yalnız o depolar.
   * İlk yazımda tekil `warehouseId`di ve bu ikinci bir kural doğuruyordu: personelin kapsamı
   * zaten bir DİZİ (`user_profile.warehouse_ids`), çağıran onu tekile indirmek zorunda kalırdı ve
   * iki depolu bir depocunun ikinci deposu sessizce düşerdi.
   *
   * **Boş dizi "hepsi" DEĞİL "hiçbiri"** (`stock.service.ts:127` ile aynı): kapsamı boş bir
   * personele bütün depoların imhasını göstermek, süzgecin var oluş sebebini tersine çevirirdi.
   */
  async listPage(
    opts: {
      from?: Date;
      to?: Date;
      limit?: number;
      cursor?: KeysetCursor;
      query?: string;
      warehouseIds?: readonly string[];
    } = {},
  ): Promise<Page<StockAdjustmentDetail>> {
    if (opts.warehouseIds?.length === 0) return { rows: [], nextCursor: null };
    const term = opts.query?.trim();
    const page = await this.getPageAs(StockAdjustmentDetailRowSchema, { warehouseId: opts.warehouseIds ? [...opts.warehouseIds] : undefined }, {
      // `search_text` seçilmiyor: süzgeç sunucuda çalışıyor, metnin kendisi ekrana taşınmıyor.
      select: 'id,stock_id,qty,reason,unit_cost,note,created_by,reference_no,created_at,warehouse_id,lot_number,expiry_date,variant_id,variant_label,product_id,product_name',
      rangeFilters: periodFilters(opts.from, opts.to),
      ...(term ? { searchFilters: [{ field: 'searchText', query: term }] } : {}),
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
    });
    return { ...page, rows: page.rows.map(toDetail) };
  }
}

/** Görünümün düz satırı → ekranın beklediği iç içe şekil. Tek yerde, iki okuma yolu yok. */
function toDetail(row: StockAdjustmentDetailRow): StockAdjustmentDetail {
  const { lotNumber, expiryDate, variantId, variantLabel, productId, productName, ...adjustment } = row;
  return {
    ...adjustment,
    stock: {
      id: row.stockId,
      lotNumber,
      expiryDate,
      variant: { id: variantId, label: variantLabel, product: { id: productId, name: productName } },
    },
  };
}
