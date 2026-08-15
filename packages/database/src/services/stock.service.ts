import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AvailableStockSchema,
  WarehouseVariantThresholdSchema,
  AvailableStockTotalSchema,
  StockBatchDetailSchema,
  StockSchema,
  StockInsertSchema,
  StockUpdateSchema,
  StockWithProductDatesSchema,
  type AvailableStock,
  type AvailableStockTotal,
  type Stock,
  type StockBatchDetail,
  type StockInsert,
  type StockUpdate,
  type StockWithProductDates,
} from '@lezzet/types';
import { toCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';
import { dbToApp } from '../utils/case-transformers';

/**
 * Stok partisi servisi (06.2). Parti CRUD + kullanılabilir stok okumaları.
 *
 * **Karar vermez, satır getirir** (STACK §4): "bu parti satılabilir mi", "yaklaşan son tarih mi",
 * "FEFO'da hangisi çıkar" kararları saf motordadır (`domain-core/stock/*`). Servis o kararların
 * girdisini tek turda toplar.
 *
 * Kullanılabilir stok SAKLANMAZ, `available_stock` görünümünden türetilir:
 * `fiili − aktif rezervasyon` (süresi dolmuş rezervasyon sayılmaz — görünüm cron'u beklemez).
 */

/** Parti + kimin partisi olduğu — iki okumanın paylaştığı gömülü seçim (tek yerde yazılır). */
const BATCH_DETAIL_SELECT =
  '*,variant:product_variant(id,label,product:product(id,name,category_id,date_type,shelf_life_days,vat_rate))';

/**
 * Lot aramasının tavanı. Geri çağırma bir NUMARAYLA yapılır; onlarca eşleşme çıkıyorsa terim fazla
 * geniştir ve cevap liste değil daraltma olmalıdır. Tavan SESSİZ değil: çağıran satır sayısını görür
 * ve tavana dayanıldığını ekranda söyler.
 */
export const LOT_SEARCH_LIMIT = 50;
export class StockService extends BaseDbService<Stock, StockInsert, StockUpdate> {
  /** Kolonlar `stock.purchase_price` / `stock.offer_price` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['purchasePriceCents', 'offerPriceCents'];

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
   * Varyantın BİR DEPODAKİ partileri — **FEFO sırasında** (önce süresi dolan). Hazırlık ekranının
   * okuması.
   *
   * `warehouseId` zorunlu: hazırlık daima siparişin deposundan toplanır ve başka deponun partisi
   * listede görünürse depocu onu seçer — DB kısıtı reddeder ama bu kötü bir yol. Depo-ÜSTÜ okuma
   * gereken tek yer geri çağırmadır ve onun kendi yolu var (`findByLot` / `listByIds`).
   */
  async listByVariant(warehouseId: string, variantId: string): Promise<Stock[]> {
    return this.getAll({ warehouseId, variantId }, { orderBy: 'expiryDate', orderDirection: 'asc' });
  }

  /**
   * **Varyantın PARTİ GEÇMİŞİ — tükenmişler DAHİL** (22.30).
   *
   * `listByVariant` yalnız bir deponun elindekini FEFO sırasında verir; burada soru başka: *"bu
   * üründen ne zaman, ne kadar, kaça girdi ve ne oldu"*. Cevap tükenmiş partileri de gerektirir —
   * onları eleyen bir liste, geçmişin tam da anlatmak istediği kısmını siler.
   *
   * En YENİ önce ve TAVANLI: parti kaydı veriyle sınırsız büyüyen bir kümedir (`CLAUDE §1`), ama
   * burası bir defter değil bir bakış — "son N giriş" sorusunun cevabı. Tavana dayanıldığını çağıran
   * satır sayısından anlar ve ekranda söyler; sessiz kırpma yok.
   */
  async listVariantHistory(variantId: string, warehouseIds: readonly string[] | undefined, limit: number): Promise<Stock[]> {
    // Boş dizi = "hiçbir depo": süzgeci hiç uygulamamak TÜM depoları getirirdi (`listInStockDetailed`
    // ile aynı sözleşme).
    if (warehouseIds?.length === 0) return [];
    const filters: Record<string, unknown> = { variantId };
    if (warehouseIds) filters.warehouseId = [...warehouseIds];
    return this.getAll(filters, { orderBy: 'createdAt', orderDirection: 'desc', limit });
  }

  /**
   * Partiler + ürünün tarih alanları (tip, toplam raf ömrü) TEK sorguda. Raf ömrü kararlarının
   * (satılabilirlik, yaklaşan son tarih, MLOR) girdisi budur; hesabı çağıran motora yaptırır.
   */
  async listByVariantWithDates(warehouseId: string, variantId: string): Promise<StockWithProductDates[]> {
    return this.getAllAs(StockWithProductDatesSchema, { warehouseId, variantId }, {
      select: '*,variant:product_variant(id,product:product(date_type,shelf_life_days))',
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
   * İndirimli teklife açılmış partiler (offer_price dolu) — near-expiry vitrini.
   *
   * Varyant listesi de kabul eder: vitrin bir sayfadaki tüm ürünlerin teklifini TEK sorguda okur,
   * kart başına sorgu atmaz (N+1). Süzgeçsiz çağrı katalogdaki tüm açık teklifleri verir — teklif
   * sayısı doğası gereği küçüktür (partiyi insan teklife açar, DOMAIN §5).
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
   * **Eldeki TÜM partiler**, kimin partisi olduklarıyla birlikte (09.13 stok ekranının gövdesi).
   *
   * Sayfalanmaz ve bu bilinçlidir: küme fiziksel gerçekle sınırlı — depoda duran parti sayısı kadar.
   * Zamanla büyümez, mal tükendikçe erir (`physical_qty > 0` süzgeci boşalanı düşürür). Sayfalasaydık
   * "yaklaşan tarihli" uyarısı listenin kuyruğunda kalan partileri sessizce yutardı; oysa o uyarının
   * TAM olması gerekir — bir partiyi kaçırmak imha edilecek malı satmak demektir.
   *
   * Kararı motor verir (`domain-core/stock/offer` + `shelf-life`): bu okuma yalnız ölçütün girdisini
   * (tarih tipi, toplam raf ömrü, teklif fiyatı) tek turda toplar.
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

  /** Kimlikle parti okuma — sunucu tarafı kapıların girdisi (ör. "bu partiye teklif açılabilir mi"). */
  async getBatchDetails(ids: readonly string[]): Promise<StockBatchDetail[]> {
    if (ids.length === 0) return [];
    return this.getAllAs(StockBatchDetailSchema, { id: [...ids] }, { select: BATCH_DETAIL_SELECT });
  }

  /**
   * Lot numarasıyla parti arama — geri çağırmanın (rappel) ilk adımı. Tedarikçi "şu lotu topla"
   * dediğinde elde yalnız o numara vardır; hangi varyantın hangi partisi olduğu buradan çıkar.
   *
   * Eşleşme PARÇA aramasıdır (`ilike`): operatör telefonda okunan numarayı eksik/parçalı girer.
   * Stoğu bitmiş partiler de gelir — geri çağırmada asıl aranan zaten satılıp gitmiş maldır.
   */
  async findByLot(lot: string): Promise<StockBatchDetail[]> {
    // `%`, `,` ve parantez PostgREST'in `or=()` gramerinde ayraçtır — terim temizlenmezse sorgu bozulur.
    const term = lot.trim().replace(/[%,()*]/g, '');
    if (!term) return [];
    return this.getAllAs(StockBatchDetailSchema, undefined, {
      select: BATCH_DETAIL_SELECT,
      orFilters: [`lot_number.ilike.*${term}*`],
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
   * Çok varyantın kullanılabilirini TEK sorguda — vitrin listesi ve sepet doğrulaması varyant başına
   * ayrı sorgu atarsa N+1 doğar. Dönen harita eksik anahtar bırakmaz.
   *
   * **`warehouseId` ZORUNLU ve ilk parametre (T8).** Geçişin en riskli sessiz bozulması buradaydı:
   * süzgeç olmasaydı iki deponun satırı aynı varyant anahtarına düşer ve `Map`'te SON DEPO
   * KAZANIRDI — kimse fark etmeden yanlış stok gösterilir, olmayan mal satılırdı. Parametreyi
   * zorunlu yapmak o kırılmayı derleme anında gürültülü hale getirir.
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
   * ÇOK DEPO × çok varyant — `(depo, varyant)` taneli ham satırlar.
   *
   * Elimizde iki uç vardı ve **arada bir şey yoktu**: tek depo (`getAvailableMap`) ve depo-üstü
   * toplam (`getNetworkAvailabilityMap`, ki satış kararı onu okuyamaz). Operasyonun "Tüm depolar"
   * görünümü tam ortada duruyor — hem toplamı hem kırılımı istiyor ve beş depo için beş tur atmak
   * N+1'dir.
   *
   * **Ham satır dönüyor, hazır toplam değil.** Toplamı serviste üretmek "N depoda var" ipucunu da
   * servise taşırdı ve o tamamen sunum. Sınır şurada: hangi satırların toplanacağı (kapsam) bir
   * karardır ve o burada; nasıl toplanacağı sunumdur ve o ekranda.
   *
   * **`warehouseIds` zorunlu ve varsayılansız (T8).** Boş dizi "hepsi" DEĞİL "hiçbiri"dir —
   * kapsamsız personel hiçbir şey görmez. O hâlde sorgu HİÇ atılmaz: PostgREST'te `in.()` boş
   * listesi güvenilmez ve fail-closed niyetini veriye değil koda yazıyoruz.
   *
   * ── BOŞ SATIRLAR İSTENMİYOR — VE BU BİR PERFORMANS SÜSÜ DEĞİL, ARIZA DÜZELTMESİ (22.31) ──
   * Görünüm `varyant × depo` ÇAPRAZ birleşimidir: malı olmayan her çift için de bir satır üretir ve
   * hepsi sıfırdır. Süzgeçsiz sorgu bu yüzden `varyant sayısı × depo sayısı` satır ister ve
   * PostgREST'in satır tavanına (`max_rows`, yerelde 1000) dayanınca kalanı **sessizce keser** —
   * sıralama da olmadığı için hangi varyantın satırının düştüğü rastgeledir. Sonuç: elde 34 adet
   * duran ürün ekranda "elde 0" görünür (ölçüldü 14.08: 53 aktif depo × ~50 boy = 2650 satır
   * istenirken 1000 dönüyordu; kullanıcı ekran görüntüsü).
   *
   * Sıfır satırın taşıdığı bilgi yok: çağıran satırları TOPLUYOR, eksik satır zaten 0 demek. Süzgeç
   * kümeyi "gerçekten malı ya da rezervasyonu olan çiftler"e indiriyor — aynı cevap, tavana
   * dayanmayan bir sorgu.
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
   * Depo AĞI genelinde toplam kullanılabilir (`available_stock_total`).
   *
   * **Satış kararı bunu OKUMAZ:** birleştirilmiş stok kimsenin stoğu değildir — 3 STR'de + 2
   * KEHL'de duran maldan 5 kişilik sipariş çıkmaz. Meşru iki tüketicisi var: tedarik önerisi
   * ("toplamda ne kadar kaldı, sipariş vermeli miyim") ve ziyaretçiye "tükendi" demenin tek
   * dayanağı (C3 — yalnız HİÇBİR depoda yoksa söylenir).
   *
   * ── ADI NİYETİNİ SÖYLÜYOR (19.13) ────────────────────────────────────────────
   * Eski adı `getAvailableTotalMap`'ti ve bu bir açıktı: `getAvailableMap`'e fazladan bir kelime
   * eklenmiş gibi duruyordu, oysa **sözleşmesi bambaşka**. `getAvailableMap`'te unutulan argüman
   * DERLENMEZ; burada unutulan bağlam derlenir, çalışır ve makul görünen bir sayı döndürür. Ad artık
   * çağıranı bir cümle kurmaya zorluyor: "ağ genelinde".
   *
   * Kapsamla süzülmüş çoklu-depo okuması isteyen `listAvailableAcross`'a gider — o kapı 19.13'te
   * tam olarak bu metodun yanlış kullanımını gereksiz kılmak için açıldı.
   *
   * Dönüş tipi `boolean` haritasına DARALTILAMIYOR (ölçüldü): paket okuması `available < item.qty`
   * karşılaştırması yapıyor, yani gerçek miktara ihtiyacı var (`storefront/packages.ts`).
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
   * Varyant başına **tahmini birim maliyet** (KDV hariç): eldeki partilerin alış fiyatlarının, fiili
   * adetle **ağırlıklı ortalaması**. Tek sorgu — varyant başına okuma N+1 doğururdu.
   *
   * Gerçek COGS parti başına bellidir ve sipariş anında FEFO ile kesinleşir; bu okuma **planlama**
   * içindir: fiyat verirken (paket kurarken, marj-altı uyarısında) "bana kaça mal oluyor" sorusunun
   * bugünkü en iyi cevabı. İki tahmin arasında ağırlıklı ortalamayı seçtik: son alış fiyatı tek bir
   * pazarlığın sapmasını tüm stoğa yayardı, en ucuz/en pahalı parti ise uçları gösterirdi.
   *
   * Alış fiyatı GİRİLMEMİŞ parti hesaba KATILMAZ (0 saymak maliyeti düşük gösterip marjı şişirirdi).
   * Hiç fiyatlı partisi olmayan varyant haritada YER ALMAZ: "bilmiyorum" ile "sıfır" farklı şeyler —
   * çağıran eksikliği söyleyebilsin diye ayrımı koruyoruz.
   */
  /**
   * Varyant başına SON alışlar — en yeniden eskiye, en fazla `limit` tane (**cent**).
   *
   * `unitCostMap`'ten iki farkı var ve ikisi de bilinçli:
   * - **Tükenmiş parti de sayılır.** Soru "elimde ne var" değil, "bunu yeniden almak kaça" — alış
   *   geçmişi stok bitince silinmez, fiyat kararı da stoksuz kalmaz.
   * - **Ortalama alınmaz, sıra korunur.** Aykırı alım ancak komşularıyla karşılaştırılınca
   *   anlaşılır; ortalama onu zaten içine alıp saklardı (karar `domain-core/replacementCost`).
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
    // ÜÇ KOLON okunur, satırın tamamı değil: parti satırı geniş (lot, konum, tarihler, teklif fiyatı,
    // damgalar) ve yüz varyantlık bir okumada 58 KB taşıyordu — hesap için gereken üç sayı. Ham sorgu,
    // çünkü dar seçim `StockSchema`'yı doğrulayamaz (zorunlu alanlar gelmiyor); şema yerine burada
    // sayıya indiriyoruz. `numeric` string dönebilir (bkz. dbNumeric) → Number() ile normalize.
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
    // Ortalama ÖNCE euro'da alınır, kuruşa SONRA inilir: parti başına yuvarlamak çok partili bir
    // varyantta her partide bir kuruş kaybettirirdi. Eskiden burası yuvarlanmamış euro döndürüyor ve
    // her tüketici kendi `toCents`'ini çağırıyordu — sonuç aynı, dönüşümün yeri farklıydı (02.9).
    return new Map([...acc].flatMap(([id, { qty, total }]) => (qty > 0 ? [[id, toCents(total / qty)] as const] : [])));
  }

  /**
   * BİR DEPODA eşik altına inen varyantlar ("sipariş zamanı" önerisinin girdisi, 06.11).
   *
   * **Eşik iki katmanlı (C6):** varyanttaki `minStockQty` varsayılandır, `warehouse_variant_threshold`
   * satırı yalnız İSTİSNA yazar — fiyatın müşteriye-özel satır deseniyle aynı. Küresel tek eşik çok
   * depoda yapısal olarak yanlış cevap verir: 20 adet Strasbourg'da bol, Kehl'de kritik olabilir.
   * İkisi de yoksa varyantın eşiği yok demektir ve listeye hiç girmez.
   *
   * Üç turda okur (varsayılanlar · istisnalar · kullanılabilirler) — varyant başına sorgu YOK.
   */
  async listBelowMinStock(warehouseId: string): Promise<Array<AvailableStock & { minStockQty: number }>> {
    const [{ data: variantRows, error: variantError }, { data: overrideRows, error: overrideError }] = await Promise.all([
      this.supabase.from('product_variant').select('id,min_stock_qty').eq('is_active', true),
      // Projeksiyon ŞEMANIN İSTEDİĞİ ÜÇ KOLONU da çeker. `warehouse_id` süzgeçte var diye
      // seçilmemişti; şema onu zorunlu tuttuğu için `parse` `undefined` görüp patlıyordu ve
      // `/operations/procurement` tamamen çöküyordu. Arıza kodun girdiği gün değil, o depoya
      // İLK eşik istisnası yazıldığı gün doğdu — satır yoksa `.map` hiç koşmuyor.
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

  /**
   * Partinin fiili miktarını değiştirir. **İmha/fire buradan geçmez** — o iki tabloya yazar ve
   * `adjust_stock` RPC'sindedir (06.6, STACK §13). Bu uç sayım düzeltmesi gibi tek-tablo işleri
   * içindir.
   */
  async setPhysicalQty(id: string, physicalQty: number): Promise<Stock> {
    return this.update({ id, physicalQty });
  }

  /** Partiyi teklife açar/kapatır (near-expiry indirimi) — kararı insan verir, sistem önerir. */
  async setOfferPrice(id: string, offerPriceCents: number | null): Promise<Stock> {
    return this.update({ id, offerPriceCents });
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
