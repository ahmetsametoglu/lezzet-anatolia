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
 * Dönem süzgeci **`occurred_at`e bakar, `created_at`e değil** (06.14).
 *
 * İkisi de doğru bir zamandır ama soruları farklı: "bu çeyrekte ne çıktı" fiziksel bir sorudur ve
 * cevabı olayın anıdır; `created_at` kaydın yazıldığı andır ve defterin SIRASINI verir. Geriye
 * dönük yazılan bir kayıt `created_at` ile süzülseydi ait olduğu döneme değil, yazıldığı döneme
 * düşerdi (`stock_intake`in `date`/`created_at` ayrımıyla aynı gerekçe, 22.28).
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
 * **Stok hareket defteri** (06.14) — miktar değiştiren her olayın tek kaydı.
 *
 * `StockAdjustmentService`in yerini aldı: o servis yalnız "satış dışı" azalışları okuyordu ve
 * ekran onu çıkışların tamamı sanıyordu. Defter tek olunca o ayrım kalktı — satış, kapı satışı,
 * sevk, imha, sayım, iade hepsi burada.
 *
 * **Yazma yolu YOK ve bu bilinçli** (`order_item_batch`in aynı kararı): satırlar yalnız RPC'lerden
 * doğar, çünkü hareket kaydı ile stoğun değişmesi bölünemez bir yazımdır (`STACK §13`). Bu sınıftan
 * geçen tek yazma kapısı `adjust()`/`adjustBatch()`, ikisi de RPC çağırır.
 */
export class StockMovementService extends BaseDbService<StockMovement, StockMovementInsert, StockMovementUpdate> {
  /** Kolon `stock_movement.unit_cost` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['unitCostCents'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'stock_movement', StockMovementSchema, StockMovementInsertSchema, StockMovementUpdateSchema);
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
   * **Çok partili tek olay** (10.5): N satır + PAYLAŞILAN bir belge numarası, hepsi bölünemez.
   *
   * `adjust()`'ı N kez çağırmak aynı şey değildir: üçüncü satır düştüğünde elde yarım bir tutanak
   * kalır ve kâğıtla eşleşmez. Öneki motor seçer (`documentPrefixFor`), numarayı DB üretir.
   *
   * **Yön SATIR başınadır** (06.14): tek sayım tutanağında hem fazla hem eksik satır olabilir ve
   * tasarım bunu açıkça istiyor — *"o belge iki sekmede de görünür ve ekran bunu belgenin iki yüzü
   * olarak anlatmalıdır."* Tip ise olaya aittir: bir sayım tutanağı bir sayımdır.
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
   * Birden çok partinin hareketleri TEK turda (22.30) — ürün geçmişi paneli parti başına soruyor,
   * satır başına sorgu N+1 olurdu (`stock_movement_stock_idx`).
   *
   * **Bu okuma defter kurulunca ÇOK daha fazlasını veriyor:** eskiden yalnız düzeltmeler dönerdi ve
   * satışlar `order_item_batch`ten ayrıca kurulurdu (altı servis, ~530 satır telafi kodu). Artık
   * partinin bütün geçmişi tek sorguda.
   */
  async listByStocks(stockIds: readonly string[]): Promise<StockMovement[]> {
    if (stockIds.length === 0) return [];
    return this.getAll({ stockId: [...stockIds] }, { orderBy: 'createdAt', orderDirection: 'desc' });
  }

  /**
   * **Varyantın ÇIKIŞLARI** — hangi partiden, ne zaman, ne kadar mal gitti (22.30 · 06.14).
   *
   * ── BU OKUMA ESKİDEN BİR TAHMİNDİ ───────────────────────────────────────────
   * Kaynağı `order_item_batch`ti (`exitsByVariant`) ve iki yapısal kusuru vardı:
   *   · **Anı yanlıştı:** o tablonun zaman damgası yok, çıkış anı olarak `order.created_at`
   *     kullanılıyordu — yani SİPARİŞİN verildiği gün. Sipariş bir gün önce verilip ertesi hafta
   *     teslim edilirse satış hızı, parti ömrü ve "ilk/son satış" bir hafta kayıyordu.
   *   · **Sevk hiç görünmüyordu:** başka depoya giden mal da partiden çıkar ama o kayıt başka
   *     tablodaydı; hız hesabı onu hiç saymıyordu.
   *
   * Defterde ikisi de kendiliğinden düzeliyor: satır mal fiilen çıkınca doğuyor ve kendi anını
   * taşıyor. `kind` da geliyor — çağıran "satış hızı" ile "depodan çıkış"ı ayırmak isterse ayırır.
   *
   * **TARİH SÜZGECİ YOK ve bu bilinçli** (22.31): *"bu ürün hiç satıldı mı"* sorusu 90 günle
   * sınırlanamaz — pencere okumanın değil hesabın işi.
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
   * Defter SAYFASI — hareket + hangi partinin, hangi ürünün (09.13).
   *
   * Defter zamanla **sınırsız** büyür (CLAUDE.md: veriyle büyüyen küme) → keyset sayfalama.
   * Ürün/parti adları görünümün içinde geldiği için satır başına ürün sorgusu (N+1) yok.
   *
   * `direction` süzgeci sekmeyi belirler: Çıkışlar `'out'`, Mal kabul `'in'`. Verilmezse ikisi de —
   * bir partinin tam geçmişi bu hâliyle okunur.
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
   * Dönemin TİP ve SEBEP dağılımı + toplamı — "bu çeyrek ne çıktı, hangi türden".
   *
   * Sayfalı liste bu soruyu yanıtlayamaz: ilk 30 satır dönemin toplamı değildir. Toplam ancak
   * dönemin TAMAMI üzerinden çıkar, o yüzden ayrı ve DAR bir okuma — dört kolon, satırın kalanı
   * taşınmaz.
   *
   * ── TOPLAM ARTIK YÖNLÜ VE POZİTİF (06.14) ───────────────────────────────────
   * Eski `reasonSummary` işaretli `qty`leri topluyordu ve sonuç şuydu: "Çıkışlar" sekmesi dönem
   * toplamını **−13,49 €** diye yazıyordu, çünkü iade restoku ve sayım fazlası birer GİRİŞ olduğu
   * hâlde aynı toplamda eriyordu. Artık çağıran yönü seçer, toplam o yönün içindedir ve hep
   * pozitiftir. Net isteyen iki çağrı yapar — ama bunu BİLEREK yapar.
   *
   * `byReason` yalnız `write_off` satırlarını kırar (imha · hasar · kayıp): ekranın "Neden
   * dağılımı" şeridi budur. Tip kırılımı `byKind`'da.
   *
   * RPC YAZILMADI: tek tablo üzerinde toplama, STACK §13'ün "çok tablolu + farkı bariz" eşiğini
   * karşılamıyor. Dönem seçicisi de yükü sınırlıyor. "Tümü" seçildiğinde okuma geçmişle büyür —
   * ölçülüp gerekirse RPC'ye ya da günlük özete alınır; bugün ölçüsüz bir migration yazmak erken
   * karar olurdu.
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
   * Dönemsel FİRE toplamı — VARYANT bazında adet ve maliyet. Kayıp raporunun (DOMAIN §12) girdisi.
   *
   * ── HANGİ HAREKETLER SAYILIR (06.14'te netleşti) ────────────────────────────
   * Eskiden bu okuma `stock_adjustment`ın TAMAMINI işaretli topluyordu ve içinde iade restoku da
   * vardı; künyesi bunu *"rapor net kaybı gösterir"* diye savunuyordu. Defterle birlikte soru
   * berraklaştı ve iki hareket dışarıda kaldı:
   *
   *   · **`return_restock` SAYILMAZ** — karşılığı `order_item_batch`ten zaten düşülmüş (`0020`
   *     künyesi: *"bizden çıkıp GERİ GELMEYEN mal"*). İkinci kez saymak aynı iadeyi iki kez
   *     saymaktı ve `domain-core/stock/history` bunu bir üretim arızası olarak kaydetmiş.
   *   · **`sale`/`counter_sale`/`transfer_*` SAYILMAZ** — satılan mal kayıp değildir; kârda zaten
   *     COGS olarak duruyor, buraya da girseydi aynı maliyet iki kez düşülürdü.
   *
   * Kalan: `write_off` (gerçek fire) + `count_diff` (fiziksel sapma, iki yönlü). Sayım fazlası
   * (`in`) toplamı DÜŞÜRÜR: rafta beklenenden çok çıkan mal bir kayıp değil, kaybın telafisidir.
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
 * `stock_movement_detail` görünümü (06.14 · 09.18 devamı) — defterin ARANABİLİR okuması.
 *
 * Ayrı servis, çünkü görünüm yazılmaz (`never, never`).
 *
 * **Neden görünüm** (operasyon talebi §2): arama terimi lot numarasına VEYA ürün adına bakıyor;
 * ikisi iki ayrı gömülü kaynakta. PostgREST'in `or=` grubu yalnız üst tablonun kolonlarına bakar,
 * yani bu koşul sorgu kurucusuyla ifade edilemiyor (`STACK §13` istisnası). Görünümün içinde
 * kurulan tek bir `search_text` kolonu sorunu düz bir süzgece indiriyor ve keyset sayfalama bozulmuyor.
 *
 * **Ekranın gördüğü şekil DEĞİŞMİYOR:** görünüm düz kolon döndürür, burada iç içe
 * `StockMovementDetail`'e eşlenir.
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
   * **`warehouseIds` SUNUCUDA süzülür** (10.5 · operasyon talebi 08.08). Ekran geçici olarak bellekte
   * süzüyordu: sayfa okunuyor, satırların partileri ayrıca çekiliyor, yalnız o deponunkiler
   * kalıyordu. Çalışıyordu ama bedeli vardı — sayfa keyset'li, yani "30 satırın içindeki bu depo"
   * demek oluyordu ve sonraki sayfalar sessizce eksik geliyordu (`onlyShippable` ile aynı sınıf).
   *
   * **DİZİ, tekil değil** — sözleşme deponun her yerdeki sözleşmesiyle aynı (`StockService`,
   * `WarehouseService`): verilmezse süzgeç yok (depo-üstü okuma), verilirse yalnız o depolar.
   *
   * **Boş dizi "hepsi" DEĞİL "hiçbiri"** (`stock.service.ts:127` ile aynı): kapsamı boş bir
   * personele bütün depoların hareketlerini göstermek, süzgecin var oluş sebebini tersine çevirirdi.
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
