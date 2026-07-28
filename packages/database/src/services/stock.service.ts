import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AvailableStockSchema,
  StockSchema,
  StockInsertSchema,
  StockUpdateSchema,
  StockWithProductDatesSchema,
  type AvailableStock,
  type Stock,
  type StockInsert,
  type StockUpdate,
  type StockWithProductDates,
} from '@lezzet/types';
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
export class StockService extends BaseDbService<Stock, StockInsert, StockUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'stock', StockSchema, StockInsertSchema, StockUpdateSchema);
  }

  /** Varyantın partileri — **FEFO sırasında** (önce süresi dolan). Depo hazırlık ekranının okuması. */
  async listByVariant(variantId: string): Promise<Stock[]> {
    return this.getAll({ variantId }, { orderBy: 'expiryDate', orderDirection: 'asc' });
  }

  /**
   * Partiler + ürünün tarih alanları (tip, toplam raf ömrü) TEK sorguda. Raf ömrü kararlarının
   * (satılabilirlik, yaklaşan son tarih, MLOR) girdisi budur; hesabı çağıran motora yaptırır.
   */
  async listByVariantWithDates(variantId: string): Promise<StockWithProductDates[]> {
    return this.getAllAs(StockWithProductDatesSchema, { variantId }, {
      select: '*,variant:product_variant(id,product:product(date_type,shelf_life_days))',
      orderBy: 'expiryDate',
    });
  }

  /** Stoğu olan partiler (fiili > 0) — boş partiler hazırlık ve teklif listelerini kirletmesin. */
  async listInStock(variantId: string): Promise<Stock[]> {
    return this.getAll({ variantId }, {
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
  async listOfferBatches(variantId?: string | string[]): Promise<Stock[]> {
    return this.getAll(variantId ? { variantId } : undefined, {
      isNotNullFields: ['offer_price'],
      rangeFilters: [{ field: 'physical_qty', operator: 'gt', value: 0 }],
      orderBy: 'expiryDate',
    });
  }

  /**
   * Bir varyantın kullanılabilir stoğu. Satır yoksa (hiç parti girilmemiş) sıfırlarla döner —
   * çağıranın `null` kontrolü yapması gerekmez, "stok yok" da bir cevaptır.
   */
  async getAvailable(variantId: string): Promise<AvailableStock> {
    const rows = await this.readAvailable([variantId]);
    return rows[0] ?? { variantId, physicalQty: 0, reservedQty: 0, availableQty: 0, expiredDlcQty: 0 };
  }

  /**
   * Çok varyantın kullanılabilirini TEK sorguda — vitrin listesi ve sepet doğrulaması varyant başına
   * ayrı sorgu atarsa N+1 doğar. Dönen harita eksik anahtar bırakmaz.
   */
  async getAvailableMap(variantIds: string[]): Promise<Map<string, AvailableStock>> {
    const rows = await this.readAvailable(variantIds);
    const map = new Map(rows.map((r) => [r.variantId, r]));
    for (const id of variantIds) {
      if (!map.has(id)) map.set(id, { variantId: id, physicalQty: 0, reservedQty: 0, availableQty: 0, expiredDlcQty: 0 });
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
  async unitCostMap(variantIds: string[]): Promise<Map<string, number>> {
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
    // Yuvarlama YAPILMAZ: tüketici kuruşa çevirirken yuvarlar. Burada yuvarlamak, çok kalemli bir
    // pakette her kalemde bir kuruş kaybettirip maliyeti sistematik olarak eksik gösterirdi.
    return new Map([...acc].flatMap(([id, { qty, total }]) => (qty > 0 ? [[id, total / qty] as const] : [])));
  }

  /**
   * Eşik altı varyantlar ("sipariş zamanı" önerisinin girdisi, 06.11). İki turda okur — görünüm
   * PostgREST'te tabloya gömülemez (ilişki tanımı yok). Varyant başına sorgu YOK: eşiği olan
   * varyantlar tek sorguda, kullanılabilirleri tek sorguda gelir.
   */
  async listBelowMinStock(): Promise<Array<AvailableStock & { minStockQty: number }>> {
    const { data, error } = await this.supabase
      .from('product_variant')
      .select('id,min_stock_qty')
      .not('min_stock_qty', 'is', null)
      .eq('is_active', true);
    if (error) throw error;
    const thresholds = (data ?? []) as Array<{ id: string; min_stock_qty: number }>;
    if (thresholds.length === 0) return [];

    const available = await this.getAvailableMap(thresholds.map((t) => t.id));
    return thresholds
      .map((t) => ({ ...available.get(t.id)!, minStockQty: t.min_stock_qty }))
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
  async setOfferPrice(id: string, offerPrice: number | null): Promise<Stock> {
    return this.update({ id, offerPrice });
  }

  /**
   * `available_stock` GÖRÜNÜMÜNÜ okur — base'in sorgu kurucusu `stock` tablosuna bağlı olduğu için
   * tek ham okuma burada. Dönüşüm ve doğrulama yine ortak yoldan geçer (dbToApp + Zod).
   */
  private async readAvailable(variantIds: string[]): Promise<AvailableStock[]> {
    if (variantIds.length === 0) return [];
    const { data, error } = await this.supabase.from('available_stock').select('*').in('variant_id', variantIds);
    if (error) throw error;
    return (data ?? []).map((row) => AvailableStockSchema.parse(dbToApp(row)));
  }
}
