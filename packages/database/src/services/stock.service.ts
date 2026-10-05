import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AvailableStockSchema,
  WarehouseVariantThresholdSchema,
  AvailableStockTotalSchema,
  StockBatchDetailSchema,
  StockSchema,
  StockInsertSchema,
  StockUpdateSchema,
  StockWithAreaSchema,
  StockWithProductDatesSchema,
  type AvailableStock,
  type AvailableStockTotal,
  type KeysetCursor,
  type Page,
  type Stock,
  type StockBatchDetail,
  type StockInsert,
  type StockUpdate,
  type StockWithArea,
  type StockWithProductDates,
} from '@lezzet/types';
import { toCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Stok partisi servisi: parti CRUD ve kullanılabilir stok okumaları; satılabilirlik ve FEFO kararları motordadır, servis girdisini
 * tek turda toplar. Kullanılabilir stok saklanmaz, `available_stock` görünümünden türer (fiili eksi aktif rezervasyon).
 */

/** Parti + kimin partisi olduğu — iki okumanın paylaştığı gömülü seçim (tek yerde yazılır). */
/**
 * Alan adı gömülü gelir, çünkü rafta aranan şey tabeladır; üç okuma (parti detayı, tarihli parti, varyant geçmişi) aynı seçimi
 * paylaşır.
 */
const AREA_EMBED = 'storage_area:storage_area(id,name,kind,sort_order)';

const BATCH_DETAIL_SELECT =
  `*,variant:product_variant(id,label,product:product(id,name,category_id,date_type,shelf_life_days,vat_rate)),${AREA_EMBED}`;

/**
 * Lot aramasının tavanı: geri çağırma bir numarayla yapılır ve çok eşleşme terimin geniş olduğunu söyler. Çağıran tavana
 * dayanıldığını satır sayısından görür.
 */
export const LOT_SEARCH_LIMIT = 50;
export class StockService extends BaseDbService<Stock, StockInsert, StockUpdate> {
  /** Kolonlar `stock.purchase_price` / `stock.offer_price` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['purchasePriceCents', 'offerPriceCents'];

  /**
   * `*,variant:product_variant(id,product:product(date_type,shelf_life_days))` — **iki katlı** gömme
   * (bkz. `BaseDbService.embeds`). Yalnız üst takma ad beyan edilir: gömülü alt ağaç bütünüyle
   * çevrilir, yani içteki `product` da kapsam altında (`date_type` → `dateType`).
   */
  // `storageArea` gömüsü çok kelimeli alan taşıdığı için beyan edilir; beyansız iç satır snake kalır ve projeksiyon şeması
  // okumada patlar.
  protected override readonly embeds = ['variant', 'storageArea'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'stock', StockSchema, StockInsertSchema, StockUpdateSchema);
  }

  /**
   * Kimliğe göre partiler — sipariş detayında "bu kalem hangi lottan çıktı" izini kurar
   * (`OrderService.listBatches` parti kimliği verir, lot numarası burada çözülür).
   */
  listByIds(ids: readonly string[]): Promise<Stock[]> {
    return this.getByIds([...ids]);
  }

  /**
   * Varyantın bir depodaki partileri FEFO sırasında, hazırlık ekranının okuması; `warehouseId` zorunludur, çünkü başka deponun
   * partisi listede görünse depocu onu seçerdi. Depo üstü okuma yalnız geri çağırmanındır (`findByLot`, `listByIds`).
   */
  /**
   * Varyant başına son lot kodları, mal kabulde lot önerisinin kaynağı: tek sorgu, yeniden eskiye ve varyant başına sınırlı, sınırı
   * ekran verir. Kodsuz partiler elenir, tekrarlar teke iner ve sıra korunur.
   */
  async recentLotsByVariants(
    warehouseId: string,
    variantIds: readonly string[],
    perVariant: number,
  ): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (variantIds.length === 0) return out;

    const rows = await this.getAll(
      { warehouseId, variantId: [...variantIds] },
      { orderBy: 'createdAt', orderDirection: 'desc' },
    );
    for (const row of rows) {
      const lot = row.lotNumber?.trim();
      if (lot === undefined || lot === '') continue;
      const list = out.get(row.variantId) ?? [];
      if (list.length >= perVariant || list.includes(lot)) continue;
      list.push(lot);
      out.set(row.variantId, list);
    }
    return out;
  }

  async listByVariant(warehouseId: string, variantId: string): Promise<Stock[]> {
    return this.getAll({ warehouseId, variantId }, { orderBy: 'expiryDate', orderDirection: 'asc' });
  }

  /**
   * Varyantın parti geçmişi, tükenmişler dahil: soru "ne zaman, ne kadar, kaça girdi ve ne oldu" olduğu için tükenmişi eleyen liste
   * geçmişi silerdi. En yeni önce ve tavanlıdır; çağıran tavana dayanıldığını satır sayısından anlar.
   */
  async listVariantHistory(
    variantId: string,
    warehouseIds: readonly string[] | undefined,
    limit: number,
  ): Promise<StockWithArea[]> {
    // Boş dizi = "hiçbir depo": süzgeci hiç uygulamamak TÜM depoları getirirdi (`listInStockDetailed`
    // ile aynı sözleşme).
    if (warehouseIds?.length === 0) return [];
    const filters: Record<string, unknown> = { variantId };
    if (warehouseIds) filters.warehouseId = [...warehouseIds];
    // Alan adıyla gelir: geçmiş satırı "bu parti hangi dolapta duruyordu" diye sorar.
    return this.getAllAs(StockWithAreaSchema, filters, {
      select: `*,${AREA_EMBED}`,
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit,
    });
  }

  /**
   * Partiler + ürünün tarih alanları (tip, toplam raf ömrü) TEK sorguda. Raf ömrü kararlarının
   * (satılabilirlik, yaklaşan son tarih, MLOR) girdisi budur; hesabı çağıran motora yaptırır.
   */
  async listByVariantWithDates(warehouseId: string, variantId: string): Promise<StockWithProductDates[]> {
    return this.getAllAs(StockWithProductDatesSchema, { warehouseId, variantId }, {
      select: `*,variant:product_variant(id,product:product(date_type,shelf_life_days)),${AREA_EMBED}`,
      orderBy: 'expiryDate',
    });
  }

  /** Stoğu olan partiler (fiili > 0) — boş partiler hazırlık ve teklif listelerini kirletmesin. */
  async listInStock(warehouseId: string, variantId: string): Promise<Stock[]> {
    return this.getAll({ warehouseId, variantId }, {
      rangeFilters: [{ field: 'physical_qty', operator: 'gt', value: 0 }],
      orderBy: 'expiryDate',
    });
  }

  /**
   * İndirimli teklife açılmış partiler; vitrin bir sayfanın tekliflerini tek sorguda okur. Süzgeçsiz çağrı bütün açık teklifleri
   * verir, çünkü teklifi insan açar ve sayısı küçüktür.
   */
  async listOfferBatches(variantId?: string | string[], warehouseId?: string): Promise<Stock[]> {
    // Depo süzgeci OPSİYONEL, `getAvailableMap`'in tersine — ve gerekçesi var: teklif bir partiye
    // bağlıdır, parti bir depodadır, ama yeri BİLİNMEYEN ziyaretçinin de bu okumaya ihtiyacı olur
    // ("bir yerde indirim var mı"). Yer belliyse süzülür, bilinmiyorsa depo-üstü sorulur; tutarın
    // gösterilip gösterilmeyeceği okuyanın kararıdır (0043'teki `has_near_expiry_offer` ayrımı).
    const filters: Record<string, unknown> = {};
    if (variantId) filters.variantId = variantId;
    if (warehouseId) filters.warehouseId = warehouseId;
    return this.getAll(Object.keys(filters).length > 0 ? filters : undefined, {
      isNotNullFields: ['offer_price'],
      rangeFilters: [{ field: 'physical_qty', operator: 'gt', value: 0 }],
      orderBy: 'expiryDate',
    });
  }

  /**
   * Eldeki bütün partiler, stok ekranının gövdesi: sayfalanmaz, çünkü küme fiziksel stokla sınırlıdır ve yakın-SKT uyarısı tam olmalı;
   * kaçan parti imha edilecek malın satılması demektir. Kararı motor verir, bu okuma girdiyi tek turda toplar.
   */
  async listInStockDetailed(variantIds?: readonly string[], warehouseIds?: readonly string[]): Promise<StockBatchDetail[]> {
    // Boş dizi ile çağrı BOŞ döner: `in.()` süzgeci PostgREST'te "hiçbiri" değil sözdizimi hatasıdır,
    // süzgeci hiç uygulamamak ise sessizce TÜM partileri getirirdi (sayfa okuması patlardı).
    if (variantIds?.length === 0 || warehouseIds?.length === 0) return [];
    // Depo süzgeci KÜME alır, `OrderListFilters` ve `listAvailableAcross` ile birebir aynı
    // sözleşmeyle: `undefined` = depo-üstü · dizi = o depolar · boş dizi = hiçbiri. Aynı soru
    // ("kapsamımdaki depolar") üç ayrı okumada soruluyor ve üçü de tek depo alacak şekilde
    // yazılmıştı — raf ömrü kuyruğu için bu özellikle yanlıştı: her depo kendi mal kabulünü yapar,
    // aynı ürünün bir depoda son günlerinde ötekinde yeni gelmiş partisi olması rutin hâl.
    const filters: Record<string, unknown> = {};
    if (variantIds) filters.variantId = [...variantIds];
    if (warehouseIds) filters.warehouseId = [...warehouseIds];
    return this.getAllAs(StockBatchDetailSchema, Object.keys(filters).length > 0 ? filters : undefined, {
      select: BATCH_DETAIL_SELECT,
      rangeFilters: [{ field: 'physical_qty', operator: 'gt', value: 0 }],
      orderBy: 'expiryDate',
    });
  }

  /**
   * Raf listesinin sayfası: depodaki partiler SKT sırasında, keyset imleçli; tam küme isteyen `listInStockDetailed`den ayrıdır,
   * çünkü ona `limit` eklemek o çağıranı bir gün kırpılmış listeyle bırakırdı. Süzgeçler sorgudadır, ürün adıyla arama çağırandadır.
   */
  async pageInStockDetailed(input: {
    warehouseId: string;
    storageAreaId?: string;
    limit: number;
    cursor?: KeysetCursor;
  }): Promise<Page<StockBatchDetail>> {
    const filters: Record<string, unknown> = { warehouseId: input.warehouseId };
    if (input.storageAreaId !== undefined) filters.storageAreaId = input.storageAreaId;
    return this.getPageAs(StockBatchDetailSchema, filters, {
      select: BATCH_DETAIL_SELECT,
      rangeFilters: [{ field: 'physical_qty', operator: 'gt', value: 0 }],
      orderBy: 'expiryDate',
      limit: input.limit,
      keysetAfter: input.cursor,
    });
  }

  /** Kimlikle parti okuma — sunucu tarafı kapıların girdisi (ör. "bu partiye teklif açılabilir mi"). */
  async getBatchDetails(ids: readonly string[]): Promise<StockBatchDetail[]> {
    if (ids.length === 0) return [];
    return this.getAllAs(StockBatchDetailSchema, { id: [...ids] }, { select: BATCH_DETAIL_SELECT });
  }

  /**
   * Girişlerin parti özeti, mal kabul defterinin sayfası için tek tur. `initial_qty` okunur, `physical_qty` değil, çünkü defter "ne
   * geldi" der ve satıldıkça eriyen sayı geçmiş kabulü küçük gösterirdi.
   */
  async summaryByIntake(intakeIds: readonly string[]): Promise<Map<string, { lineCount: number; qty: number }>> {
    const summary = new Map<string, { lineCount: number; qty: number }>();
    if (intakeIds.length === 0) return summary;

    const rows = await this.getAllAs(StockSchema.pick({ intakeId: true, initialQty: true }), {
      intakeId: [...intakeIds],
    }, { select: 'intake_id,initial_qty' });

    for (const row of rows) {
      // `intakeId` şemada nullable (PO'suz doğrudan parti düzeltmeleri): kimliksiz satır bu
      // deftere ait değildir, süzgeç zaten getirmez ama tip onu bilmiyor.
      if (row.intakeId === null) continue;
      const entry = summary.get(row.intakeId) ?? { lineCount: 0, qty: 0 };
      entry.lineCount += 1;
      entry.qty += row.initialQty;
      summary.set(row.intakeId, entry);
    }
    return summary;
  }

  /**
   * Lot numarasıyla parti arama, geri çağırmanın ilk adımı: eşleşme parça aramasıdır ve stoğu bitmiş partiler de gelir. Sayım ekranı
   * aynı kapıyı kendi deposu ve stoğu duran partilerle süzerek kullanır; süzgeç sorgudadır, tavanlı okumayı elde süzmek kaybettirirdi.
   */
  async findByLot(lot: string, opts: { warehouseId?: string; onlyInStock?: boolean } = {}): Promise<StockBatchDetail[]> {
    // `%`, `,` ve parantez PostgREST'in `or=()` gramerinde ayraçtır — terim temizlenmezse sorgu bozulur.
    const term = lot.trim().replace(/[%,()*]/g, '');
    if (!term) return [];
    return this.getAllAs(StockBatchDetailSchema, opts.warehouseId ? { warehouseId: opts.warehouseId } : undefined, {
      select: BATCH_DETAIL_SELECT,
      // Parti numarası da eşleşir: raftaki etiket tedarikçinin lotu da olabilir bizim `PRT-…` numaramız da. İki sütun tek `or=(…)`
      // grubunda virgülle yazılır, çünkü dizinin her elemanı ayrı grup olur ve gruplar VE ile bağlanırdı.
      orFilters: [`lot_number.ilike.*${term}*,batch_no.ilike.*${term}*`],
      rangeFilters: opts.onlyInStock ? [{ field: 'physical_qty', operator: 'gt', value: 0 }] : undefined,
      orderBy: 'expiryDate',
      orderDirection: 'desc',
      limit: LOT_SEARCH_LIMIT,
    });
  }

  /**
   * Bir varyantın BİR DEPODAKİ kullanılabilir stoğu. Satır yoksa sıfırlarla döner — çağıranın
   * `null` kontrolü yapması gerekmez, "stok yok" da bir cevaptır.
   */
  async getAvailable(warehouseId: string, variantId: string): Promise<AvailableStock> {
    const rows = await this.readAvailable(warehouseId, [variantId]);
    return rows[0] ?? { warehouseId, variantId, physicalQty: 0, reservedQty: 0, availableQty: 0, expiredDlcQty: 0 };
  }

  /**
   * Çok varyantın kullanılabilirini tek sorguda verir, eksik anahtar bırakmaz. `warehouseId` zorunlu ve ilk parametredir, çünkü
   * süzgeçsiz okumada iki deponun satırı aynı anahtara düşer ve haritada son depo kazanırdı.
   */
  async getAvailableMap(warehouseId: string, variantIds: string[]): Promise<Map<string, AvailableStock>> {
    const rows = await this.readAvailable(warehouseId, variantIds);
    const map = new Map(rows.map((r) => [r.variantId, r]));
    for (const id of variantIds) {
      if (!map.has(id)) {
        map.set(id, { warehouseId, variantId: id, physicalQty: 0, reservedQty: 0, availableQty: 0, expiredDlcQty: 0 });
      }
    }
    return map;
  }

  /**
   * Çok depo × çok varyant, `(depo, varyant)` taneli ham satırlar: "Tüm depolar" görünümü hem toplamı hem kırılımı ister, toplama
   * ekranındır. Boş dizi hiçbiri demektir ve sorgu atılmaz; sıfır satırlar istenmez, çünkü çapraz görünüm satır tavanına dayanıp
   * malı olan satırları sessizce keserdi.
   */
  async listAvailableAcross(warehouseIds: readonly string[], variantIds: readonly string[]): Promise<AvailableStock[]> {
    if (warehouseIds.length === 0 || variantIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from('available_stock')
      .select('*')
      .in('warehouse_id', [...warehouseIds])
      .in('variant_id', [...variantIds])
      .or('physical_qty.gt.0,reserved_qty.gt.0');
    if (error) throw error;
    return (data ?? []).map((row) => AvailableStockSchema.parse(dbToApp(row)));
  }

  /**
   * Depo ağı genelinde toplam kullanılabilir (`available_stock_total`); satış kararı bunu okumaz, çünkü birleştirilmiş stok kimsenin
   * stoğu değildir. Tüketicileri tedarik önerisi ve "hiçbir depoda yok mu" sorusudur, dönüş miktar taşır çünkü paket okuması karşılaştırır.
   */
  async getNetworkAvailabilityMap(variantIds: string[]): Promise<Map<string, AvailableStockTotal>> {
    if (variantIds.length === 0) return new Map();
    const { data, error } = await this.supabase
      .from('available_stock_total')
      .select('*')
      .in('variant_id', variantIds);
    if (error) throw error;
    const rows = (data ?? []).map((row) => AvailableStockTotalSchema.parse(dbToApp(row)));
    const map = new Map(rows.map((r) => [r.variantId, r]));
    for (const id of variantIds) {
      if (!map.has(id)) {
        map.set(id, { variantId: id, physicalQty: 0, reservedQty: 0, availableQty: 0, expiredDlcQty: 0 });
      }
    }
    return map;
  }

  /**
   * Varyant başına tahmini birim maliyet: eldeki partilerin alış fiyatlarının fiili adetle ağırlıklı ortalaması, planlama içindir.
   * Fiyatı girilmemiş parti katılmaz ve fiyatlı partisi olmayan varyant haritada yer almaz, çünkü "bilmiyorum" sıfır değildir.
   */
  /**
   * Varyant başına son alışlar, en yeniden eskiye ve en fazla `limit` tane (cent): tükenmiş parti de sayılır, çünkü soru "yeniden
   * almak kaça". Ortalama alınmaz, aykırı alım komşularıyla karşılaştırılınca anlaşılır.
   */
  async purchaseHistoryCentsMap(variantIds: string[], limit: number): Promise<Map<string, number[]>> {
    const map = new Map<string, number[]>();
    if (variantIds.length === 0) return map;

    // Üç kolon (bkz. `unitCostMap`). Sıralama SUNUCUDA: varyant başına ayrı sorgu N+1 olurdu,
    // hepsini çekip JS'te sıralamak ise büyük katalogda gereksiz veri taşırdı.
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('variant_id,purchase_price,created_at')
      .in('variant_id', variantIds)
      .not('purchase_price', 'is', null)
      .order('created_at', { ascending: false });
    if (error) throw error;

    for (const raw of data ?? []) {
      const row = raw as { variant_id: string; purchase_price: number | string };
      const price = Number(row.purchase_price);
      if (!Number.isFinite(price) || price <= 0) continue;
      const list = map.get(row.variant_id) ?? [];
      if (list.length >= limit) continue;
      // Dar seçim `moneyFields` yolundan geçmiyor (ham sorgu) — dönüşüm burada, ama yine ortak
      // `toCents` ile: elle `* 100` yazmak STACK §8'in adıyla yasakladığı biçim.
      list.push(toCents(price));
      map.set(row.variant_id, list);
    }
    return map;
  }

  /** Eldeki partilerin ağırlıklı ortalama alışı, varyant başına (**cent**). */
  async unitCostCentsMap(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    // Üç kolon okunur, satırın tamamı değil: parti satırı geniş ve hesap üç sayı ister; dar seçim `StockSchema`yı doğrulayamadığı
    // için sayıya burada inilir (`numeric` string dönebilir).
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('variant_id,physical_qty,purchase_price')
      .in('variant_id', variantIds)
      .not('purchase_price', 'is', null)
      .gt('physical_qty', 0);
    if (error) throw error;

    const acc = new Map<string, { qty: number; total: number }>();
    for (const raw of data ?? []) {
      const row = raw as { variant_id: string; physical_qty: number; purchase_price: number | string };
      const price = Number(row.purchase_price);
      const qty = Number(row.physical_qty);
      if (!Number.isFinite(price) || qty <= 0) continue;
      const cur = acc.get(row.variant_id) ?? { qty: 0, total: 0 };
      cur.qty += qty;
      cur.total += qty * price;
      acc.set(row.variant_id, cur);
    }
    // Ortalama önce euro'da alınır, kuruşa sonra inilir: parti başına yuvarlamak çok partili varyantta her partide bir kuruş
    // kaybettirirdi.
    return new Map([...acc].flatMap(([id, { qty, total }]) => (qty > 0 ? [[id, toCents(total / qty)] as const] : [])));
  }

  /**
   * Bir depoda eşik altına inen varyantlar, sipariş önerisinin girdisi: varyanttaki `minStockQty` varsayılandır, depo istisnası
   * yalnız farkı yazar, çünkü küresel tek eşik çok depoda yanlış cevap verir. İkisi de yoksa varyant listeye girmez.
   */
  async listBelowMinStock(warehouseId: string, variantIds?: readonly string[]): Promise<Array<AvailableStock & { minStockQty: number }>> {
    // Daraltma: rezervasyondan sonra yalnız dokunulan varyantlar sorulur, her checkout'ta bütün katalogu taramamak için.
    let variantQuery = this.supabase.from('product_variant').select('id,min_stock_qty').eq('is_active', true);
    if (variantIds !== undefined) {
      if (variantIds.length === 0) return [];
      variantQuery = variantQuery.in('id', [...variantIds]);
    }
    const [{ data: variantRows, error: variantError }, { data: overrideRows, error: overrideError }] = await Promise.all([
      variantQuery,
      // Projeksiyon şemanın istediği üç kolonu da çeker: `warehouse_id` seçilmeseydi `parse` patlar ve tedarik ekranı çökerdi.
      this.supabase.from('warehouse_variant_threshold').select('warehouse_id,variant_id,min_stock_qty').eq('warehouse_id', warehouseId),
    ]);
    if (variantError) throw variantError;
    if (overrideError) throw overrideError;

    // Satırlar ŞEMADAN geçer (CLAUDE.md §1): elle yazılmış bir yapısal tip, aynı bilgiyi ikinci kez
    // tanımlar ve kolon adı değişince sessizce `undefined` okumaya başlardı.
    const overrides = new Map(
      (overrideRows ?? [])
        .map((row) => WarehouseVariantThresholdSchema.parse(dbToApp(row)))
        .map((r) => [r.variantId, r.minStockQty] as const),
    );
    const thresholds = ((variantRows ?? []) as Array<{ id: string; min_stock_qty: number | null }>).flatMap((v) => {
      const limit = overrides.get(v.id) ?? v.min_stock_qty;
      return limit == null ? [] : [{ id: v.id, minStockQty: limit }];
    });
    if (thresholds.length === 0) return [];

    const available = await this.getAvailableMap(warehouseId, thresholds.map((t) => t.id));
    return thresholds
      .map((t) => ({ ...available.get(t.id)!, minStockQty: t.minStockQty }))
      .filter((row) => row.availableQty < row.minStockQty);
  }

  /** Partinin fiili miktarını değiştirir; imha ve fire buradan geçmez, `adjust_stock` RPC'sindedir. */
  async setPhysicalQty(id: string, physicalQty: number): Promise<Stock> {
    return this.update({ id, physicalQty });
  }

  /** Partiyi teklife açar/kapatır (near-expiry indirimi) — kararı insan verir, sistem önerir. */
  async setOfferPrice(id: string, offerPriceCents: number | null): Promise<Stock> {
    return this.update({ id, offerPriceCents });
  }

  /**
   * Partinin alanını yazar, "son görüldüğü yer": tek kolon, hareket defterine satır düşmez. Alanın bu deponun olup olmadığı kapının
   * sorusudur (`markBatchSeen`).
   */
  async setStorageArea(id: string, storageAreaId: string | null): Promise<Stock> {
    return this.update({ id, storageAreaId });
  }

  /**
   * `available_stock` GÖRÜNÜMÜNÜ okur — base'in sorgu kurucusu `stock` tablosuna bağlı olduğu için
   * tek ham okuma burada. Dönüşüm ve doğrulama yine ortak yoldan geçer (dbToApp + Zod).
   */
  private async readAvailable(warehouseId: string, variantIds: string[]): Promise<AvailableStock[]> {
    if (variantIds.length === 0) return [];
    const { data, error } = await this.supabase
      .from('available_stock')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .in('variant_id', variantIds);
    if (error) throw error;
    return (data ?? []).map((row) => AvailableStockSchema.parse(dbToApp(row)));
  }
}
