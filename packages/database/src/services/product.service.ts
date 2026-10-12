import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ProductSchema,
  ProductInsertSchema,
  ProductFamilySchema,
  ProductFamilyInsertSchema,
  ProductFamilyUpdateSchema,
  ProductUpdateSchema,
  ProductPoolSchema,
  ProductStockRowSchema,
  ProductPriceRowSchema,
  ProductWithRelationsSchema,
  ProductListingRowSchema,
  pickImageMeta,
  resolveLocalizedText,
  LOCALIZED_TEXT_KEYS,
  DEFAULT_PAGE_SIZE,
  type Channel,
  type KeysetCursor,
  type Page,
  type ProductStatus,
  type Product,
  type ProductWithRelations,
  type ProductListingRow,
  type ProductInsert,
  type ProductUpdate,
  type ProductVariantInsert,
  type ProductDetailsUpdate,
  type ProductVariant,
  type ProductPool,
  type ProductStockRow,
  type ProductPriceRow,
  type ProductFamily,
  type ProductFamilyInsert,
  type ProductFamilyUpdate,
  type ProductFamilyOrder,
  type ProductVatRate,
  type ImageDimensions,
  IMAGE_RENDER_FIELDS,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { camelToSnake } from '../utils/case-transformers';

/**
 * Görseli çizmek için gereken kolonlar, `IMAGE_RENDER_FIELDS` maskesinden türer. Dar okumalar küçük resmi CDN kadrajıyla kurar ve
 * kadraj alanların hepsini ister; biri eksik kalırsa küçük resim sessizce özgün dosyaya düşer.
 */
const IMAGE_RENDER_COLUMNS = Object.keys(IMAGE_RENDER_FIELDS).map(camelToSnake).join(',');
import { ilikeContains, ilikeTerm } from '../utils/filter-term';
import { dbToApp } from '../utils/case-transformers';
import { uniqueSlugForTable } from '../utils/slug';
import { ProductVariantService } from './product-variant.service';
import { ProductImageService } from './product-image.service';

// Ürün listesi süzgeçleri, operasyon ekranının URL parametreleriyle birebir. Dışa verilmez, çünkü çağıranlar nesne literali geçer ve
// tip çıkarımı yeter.
interface ProductFilters {
  /** Ad araması; üç dilde birden aranır. */
  query?: string;
  categoryId?: string;
  /** Ürün ailesi: "öteki çeşitler" okuması ve operatörün aile diyaloğu. */
  familyId?: string;
  /**
   * Koleksiyon üyeliği; kolon değil junction olduğu için gömülü ilişkiden ve sunucuda süzülür, çünkü keyset sayfalı listede istemcide
   * süzmek sonraki sayfaları eksik getirirdi. Katalog kendi sırasını (`sortOrder`) kullanır, `position` koleksiyon sayfasınındır.
   */
  collectionId?: string;
  status?: ProductStatus;
  /** Belirli ürünler — çağıran kimlikleri başka bir okumadan türetmişse (ör. teklifli partiler). */
  ids?: string[];
  /** Yalnız beyanı eksik olanlar (ad dili eksik veya alerjen boş). */
  onlyIncomplete?: boolean;
  /** Yalnız kargolanabilenler, vitrindeki "adresime gönderilebilir" çipi; sunucuda süzülür (gerekçe `collectionId`te). */
  onlyShippable?: boolean;
  /**
   * Yalnız bu ülkenin KDV oranı girilmemiş olanlar, operasyonun "Almanya oranı eksik" süzgeci; oranı olmayan ürün o ülkenin
   * tüketicisine satılmaz (`sellableIn`). Sunucuda süzülür (gerekçe `collectionId`te).
   */
  missingCountryRate?: ProductVatRate['country'];
  /** Yalnız bu ülkeye özel fiyat satırı olan boyu bulunanlar, fiyat ekranının "Almanya fiyatı olan" süzgeci. */
  hasCountryPrice?: ProductVatRate['country'];
}

interface ProductListOptions {
  filters?: ProductFilters;
  cursor?: KeysetCursor;
  limit?: number;
}

// Sayaç satırı — bir ENTITY değil, tek okumaya özgü projeksiyon; bu yüzden packages/types'ta değil
// burada yaşar (domain şeması değil, sorgu çıktısı sözleşmesi).
const ProductCountsRowSchema = z.object({
  total: z.number().int(),
  candidate: z.number().int(),
  incomplete: z.number().int(),
  byCategory: z.record(z.string(), z.number().int()),
});

/** Başlık sayaçları + kategori başına ürün sayısı (tek okumadan). */
interface ProductCounts {
  total: number;
  candidate: number;
  incomplete: number;
  byCategory: Map<string, number>;
}

// Varyantsız üründe açılan tek varyantın etiketi boş çok dilli metindir: tek boylu üründe gösterilecek boy adı yoktur.
const DEFAULT_VARIANT_LABEL = {};

// Yeni varyant girişi insert şemasından türer; `productId` `create` içinde bağlanır.
export type CreateVariantInput = Omit<ProductVariantInsert, 'productId'>;

// Yeni ürün girişi insert şemasından ve varyantlardan türer; slug'ı servis üretir.
export type CreateProductInput = Omit<ProductInsert, 'slug'> & { variants?: CreateVariantInput[] };

/**
 * Varyant seçicilerinin havuz tavanı (paket kalemi, müşteriye özel fiyat); katalog bunu aşarsa seçici aramalı sunucu okumasına döner.
 * Tavan tek yerde durur, çünkü iki ekran ayrı sayı tutsaydı biri katalog büyüdüğünde sessizce eksik liste gösterirdi.
 */
export const VARIANT_POOL_LIMIT = 500;

/**
 * Ürün projeksiyonu, liste ve sayacın ortak seçimi; ayrışsalardı sayaç başka, liste başka küme okurdu. Koleksiyon süzgeci varken ilişki
 * `!inner` olur, yoksa LEFT kalır, çünkü sabit `!inner` hiçbir koleksiyonda olmayan ürünü katalogdan düşürürdü.
 */
function productSelect(f?: ProductFilters): string {
  const collections = f?.collectionId
    ? 'collections:product_collections!inner(collection_id)'
    : 'collections:product_collections(collection_id)';
  return `*,variants:product_variant(*),${collections},countryRates:product_vat_rate(country,vat_rate)${filterEmbeds(f)}`;
}

/** Süzgeç gömmelerinin adları; snake_case yazılır, çünkü süzgeç anahtarı kolon çevirisinden geçer. */
const RATE_GAP = 'rate_gap';
const COUNTRY_PRICE = 'country_price';

/** Gömülü ilişkide süzen sorgu, ilişki seçimde yoksa reddedilir; süzgeci taşıyan her projeksiyon bu parçayı ekler. */
function filterEmbeds(f?: ProductFilters): string {
  const rateGap = f?.missingCountryRate ? `,${RATE_GAP}:product_vat_rate(country)` : '';
  const countryPrice = f?.hasCountryPrice ? `,${COUNTRY_PRICE}:product_variant!inner(price!inner(country))` : '';
  return `${rateGap}${countryPrice}`;
}

interface ProductQuery {
  filters: Record<string, unknown>;
  orFilters: string[];
  isNullFields: string[];
}

/**
 * Süzgeçleri eşitlik, `or` grubu ve `is null` koşullarına çevirir; liste, sayaç ve fiyat sıralı okuma aynı çeviriyi kullanır, yoksa
 * sayaç listeyle çelişirdi. Sınıf dışındadır, çünkü `ProductListingService` de kullanır ve süzgeç mantığı iki yerde yaşayamaz.
 */
function buildProductQuery(f?: ProductFilters): ProductQuery {
  const filters: Record<string, unknown> = {};
  const orFilters: string[] = [];
  const isNullFields: string[] = [];
  if (f?.categoryId) filters.categoryId = f.categoryId;
  if (f?.familyId) filters.familyId = f.familyId;
  // Süzgeç ancak projeksiyon `!inner` iken işler (`productSelect`); LEFT ilişkide sessizce bütün katalog döner.
  if (f?.collectionId) filters['collections.collection_id'] = f.collectionId;
  if (f?.ids) filters.id = f.ids; // dizi → IN (base sorgu kurucusu çevirir)
  if (f?.status) filters.status = f.status; // tek kolon, düz eşitlik

  // Terim kaçışı tek kaynakta (`ilikeTerm`). Arama ÜRÜN ADINDA ve üç dilin hepsinde: jsonb alanı
  // dil dil açılır, biri tutarsa satır kalır.
  const safe = ilikeTerm(f?.query);
  if (safe) {
    orFilters.push(LOCALIZED_TEXT_KEYS.map((l) => ilikeContains(`name->>${l}`, safe)).join(','));
  }

  // "Beyan eksik" ölçütü üretilmiş kolondadır (`is_incomplete`), süzgeç ve sayaç aynı gerçeği okusun diye.
  if (f?.onlyIncomplete) filters.isIncomplete = true;
  if (f?.onlyShippable) filters.shippable = true;
  // Ülkeye daraltılmış gömme boş kalan ürünler: o ülkenin oran satırı yok (PostgREST'in gömmede `is null` süzgeci).
  if (f?.missingCountryRate) {
    filters[`${RATE_GAP}.country`] = f.missingCountryRate;
    isNullFields.push(RATE_GAP);
  }
  // İç birleşimli iki gömme: ülke satırı olmayan boy da ürün de düşer.
  if (f?.hasCountryPrice) filters[`${COUNTRY_PRICE}.price.country`] = f.hasCountryPrice;
  return { filters, orFilters, isNullFields };
}

/**
 * Vitrin okumasının kapsamı: görünümün satırı depo × kanal × üründür ve iki eksenden biri süzülmezse aynı ürün sayfada tekrarlanır, keyset
 * imleci bozulur. Tek nesnede durur, çünkü üç okuma (varsayılan sıra, fiyat sırası, sayaç) aynı kapsamı kurmalı.
 */
export interface ProductListingScope {
  /**
   * `null` = yer bilinmiyor → görünümün `warehouse_id is null` satırı okunur: liste fiyatıyla
   * sıralanır, near-expiry teklif TUTARI gösterilmez (yalnız bayrağı). Eksiklik değil, verilen
   * sözün korunması: teklif bir depodadır ve ziyaretçinin posta kodu oraya düşmeyebilir.
   */
  warehouseId: string | null;
  /**
   * Görüntüleyenin ETKİN kanalı (`PricingViewer.channel`) — onaysız şirket orada zaten `b2c`'ye
   * daraltılmış gelir, yani bu okuma daraltmayı ikinci kez yapmaz.
   */
  channel: Channel;
}

/**
 * Vitrinin katalog okuması (`product_listing` görünümü); kendi sınıfı var, çünkü keyset sayfalama `tableName`e bağlıdır ve sıralama ile
 * kapsam kolonları yalnız görünümdedir. Operasyon bunu kullanmaz: görünüm kanalında fiyatı olmayan ürünü düşürür, operatör onu görmeli.
 */
export class ProductListingService extends BaseDbService<ProductListingRow, never, never> {
  /** `productSelect`in gömülü ilişkileri (bkz. `BaseDbService.embeds`). */
  protected override readonly embeds = ['variants', 'collections', 'countryRates'];

  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'product_listing',
      ProductListingRowSchema,
      ProductListingRowSchema as never,
      ProductListingRowSchema as never,
      false,
    );
  }

  /**
   * Kapsamı eşitlik süzgecine çevirir: yer belliyse depo satırı, değilse `warehouse_id is null` satırı. Null'a `eq` uygulanamadığı için
   * ikinci yarıyı `scopeOptions` taşır; kanal her zaman eşitliktir.
   */
  private scopedFilters(filters: Record<string, unknown>, scope: ProductListingScope): Record<string, unknown> {
    return { ...filters, channel: scope.channel, ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : {}) };
  }

  /** Kapsamın `eq` ile ifade edilemeyen yarısı ("yer bilinmiyor" satırı), süzgeçlerin `is null` koşullarına eklenir. */
  private scopeOptions(scope: ProductListingScope, isNullFields: readonly string[]): { isNullFields: string[] } {
    return { isNullFields: scope.warehouseId ? [...isNullFields] : [...isNullFields, 'warehouse_id'] };
  }

  /**
   * Katalogun varsayılan sırası (operatörün `sort_order`ı), görünümden okunur. Ürün tablosundan okunsaydı katalog kanalında satılamayan
   * ürünü fiyat sıralamasında süzer, varsayılan sırada gösterirdi.
   */
  async list(opts: ProductListOptions & ProductListingScope): Promise<Page<ProductListingRow>> {
    const { filters, orFilters, isNullFields } = buildProductQuery(opts.filters);
    // Şema görünümün satırıdır, ürününki değil: Zod tanımadığı alanı düşürür ve görünümün hesapladığı fiyat kaybolurdu.
    return this.getPageAs(ProductListingRowSchema, this.scopedFilters(filters, opts), {
      select: productSelect(opts.filters),
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      ...this.scopeOptions(opts, isNullFields),
    });
  }

  /**
   * Fiyata göre sayfa; kanalında fiyatı olmayan ürün görünümde yoktur, bu yüzden `sort_price` hiç boş değildir. Kapsam varsayılansızdır,
   * çünkü argümanı unutan çağrı derlenir ve tek kanallı veride doğru, ikinci kanalda sessizce yanlış okurdu.
   */
  async listByPrice(
    opts: ProductListOptions & ProductListingScope & { direction: 'asc' | 'desc' },
  ): Promise<Page<ProductListingRow>> {
    const { filters, orFilters, isNullFields } = buildProductQuery(opts.filters);
    return this.getPageAs(ProductListingRowSchema, this.scopedFilters(filters, opts), {
      select: productSelect(opts.filters),
      orderBy: 'sortPrice',
      orderDirection: opts.direction,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      ...this.scopeOptions(opts, isNullFields),
    });
  }

  /**
   * Site haritasının ürünleri: herkese açık adresler, yani ziyaretçi kapsamında (`b2c`, yer bilinmiyor) satılabilenler. Sayfalanmaz,
   * çünkü harita kümenin tamamıdır; büyürse haritanın kendi bölünme kuralı işler.
   */
  async listSellable(): Promise<ProductListingRow[]> {
    return this.getAllAs(
      ProductListingRowSchema,
      this.scopedFilters({ status: 'active' }, { warehouseId: null, channel: 'b2c' }),
      { select: productSelect(undefined), orderBy: 'sortOrder', ...this.scopeOptions({ warehouseId: null, channel: 'b2c' }, []) },
    );
  }

  /**
   * Başlıktaki sonuç sayısı, listeyle aynı kaynak, süzgeç ve kapsamla; ham `product` tablosunu sayan sayaç kanal süzgecini bilmez ve
   * listeyle çelişirdi.
   */
  async countMatching(filters: ProductFilters | undefined, scope: ProductListingScope): Promise<number> {
    const { filters: eq, orFilters, isNullFields } = buildProductQuery(filters);
    // Projeksiyon sayımda da geçer: gömülü ilişkide süzen sayım, ilişki select'te yoksa `PGRST108` ile düşer.
    return this.count(this.scopedFilters(eq, scope), {
      orFilters,
      select: productSelect(filters),
      ...this.scopeOptions(scope, isNullFields),
    });
  }
}

/**
 * Ürün CRUD'u, varyant orkestrasyonu ve koleksiyon bağı; satılabilir birim varyant olduğundan varyantsız üründe varsayılan varyant
 * açılır. Aday ürün satış ve vitrin sorgularının dışındadır (DOMAIN §13).
 */
export class ProductService extends BaseDbService<Product, ProductInsert, ProductUpdate> {
  /** `productSelect`in gömülü ilişkileri (bkz. `BaseDbService.embeds`). */
  protected override readonly embeds = ['variants', 'collections', 'countryRates'];

  constructor(supabase: SupabaseClient) {
    super(supabase, 'product', ProductSchema, ProductInsertSchema, ProductUpdateSchema);
  }

  /** Operasyon listesi, sunucuda süzülmüş ve keyset sayfalı (STACK §6); sıra `sortOrder` ile `id`, imleç kaymasın diye. */
  async list(opts: ProductListOptions = {}): Promise<Page<Product>> {
    const { filters, orFilters, isNullFields } = this.buildQuery(opts.filters);
    return this.getPage(filters, {
      select: `*${filterEmbeds(opts.filters)}`,
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      isNullFields,
    });
  }

  /**
   * Stok ekranının ürün sayfası: `list()` ile aynı süzme ve sayfalama, dar satır ve boylarla, çünkü stok ekranı beyan metinlerine bakmaz
   * ve satır genişliği pahalıdır. Aday ürün de gelir, çünkü adayın stoğu girilmiş olabilir ve depodaki mal listede görünmeli.
   */
  async listStockRows(opts: ProductListOptions = {}): Promise<Page<ProductStockRow>> {
    const { filters, orFilters, isNullFields } = this.buildQuery(opts.filters);
    return this.getPageAs(ProductStockRowSchema, filters, {
      // `sort_order` imleç için seçilir: dar şema onu düşürür, imleç ham satırdan kurulur (`pageOf`).
      select: `id,sort_order,name,category_id,date_type,shelf_life_days,status,${IMAGE_RENDER_COLUMNS},variants:product_variant(id,label,is_active,min_stock_qty,sku)${filterEmbeds(opts.filters)}`,
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      isNullFields,
    });
  }

  /**
   * Fiyat ekranının ürün sayfası: `listStockRows` ile aynı süzme ve sayfalama, farklı dar satır. Ayrıdır, çünkü fiyat ekranının okuduğu
   * alanlar stok satırında yok ve tek geniş okuma iki ekrana da öbürünün alanlarını ödetirdi.
   */
  async listPriceRows(opts: ProductListOptions = {}): Promise<Page<ProductPriceRow>> {
    const { filters, orFilters, isNullFields } = this.buildQuery(opts.filters);
    return this.getPageAs(ProductPriceRowSchema, filters, {
      // Baştaki `sort_order` ürününkidir ve imleç ona dayanır; gömülü seçimdeki boyun sıra numarasıdır.
      select: `id,sort_order,name,category_id,vat_rate,target_margin_percent,target_margin_b2b_percent,auto_price,status,${IMAGE_RENDER_COLUMNS},variants:product_variant(id,label,is_active,sort_order)${filterEmbeds(opts.filters)}`,
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      isNullFields,
    });
  }

  /**
   * Otomatik fiyatlı ve hedef marjı olan ürünler, toplu fiyat hizalamasının girdisi. Sayfalama yerine üst sınır alır; çağıran sınırın
   * aşıldığını görür (`repriceAllAuto`).
   */
  async listAutoPriced(limit: number): Promise<Product[]> {
    return this.getAll({ autoPrice: true }, { isNotNullFields: ['target_margin_percent'], orderBy: 'sortOrder', limit });
  }

  /**
   * `list()` ile aynı süzme ve sayfalama; varyantlar, koleksiyon üyelikleri ve ülke oranları aynı turda gelir, çünkü ürün başına ayrı
   * sorgu N+1 olurdu (STACK §13).
   */
  async listWithRelations(opts: ProductListOptions = {}): Promise<Page<ProductWithRelations>> {
    const { filters, orFilters, isNullFields } = this.buildQuery(opts.filters);
    return this.getPageAs(ProductWithRelationsSchema, filters, {
      select: productSelect(opts.filters),
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      isNullFields,
    });
  }

  /**
   * Paket seçicisinin havuzu: tüm katalog, dar alanlarla, çünkü beyan metinleri ve besin değerleri havuzda kullanılmaz ve satır genişliği
   * pahalıdır. Süzgeç yok, çünkü havuz pakette duran pasif kalemin adını da gösterir.
   */
  async listPool(limit: number, productIds?: readonly string[]): Promise<ProductPool[]> {
    // Kimlik verilirse havuz o ürünlere daralır: aramalı seçicide önce eşleşme bulunur, havuz
    // yalnız BULUNANLAR için okunur — katalogun tamamını çekmenin yerini bu alır.
    if (productIds && productIds.length === 0) return [];
    return this.getAllAs(ProductPoolSchema, productIds ? { id: [...productIds] } : undefined, {
      select: `id,name,${IMAGE_RENDER_COLUMNS},status,vat_rate,target_margin_percent,variants:product_variant(id,label,is_active)`,
      orderBy: 'sortOrder',
      limit,
    });
  }

  /**
   * Ekran başlığı ve kategori listesi sayaçları tek okumada (`product_counts()`); `byCategory` süzgeçsizdir, kategori listesinin kendi
   * sayısıdır. RPC'ye yalnız dört süzgeç gider (`query`, `category`, `status`, `onlyIncomplete`); ötekiyle eşleşen sayı `countMatching`ten.
   */
  async counts(filters?: ProductFilters): Promise<ProductCounts> {
    const rows = await this.executeRpc<unknown[]>('product_counts', {
      p_query: filters?.query?.trim() || null,
      p_category: filters?.categoryId ?? null,
      p_status: filters?.status ?? null,
      p_only_incomplete: filters?.onlyIncomplete ?? false,
    });
    const row = ProductCountsRowSchema.parse(dbToApp(rows?.[0] ?? {}));
    return {
      total: row.total,
      candidate: row.candidate,
      incomplete: row.incomplete,
      byCategory: new Map(Object.entries(row.byCategory)),
    };
  }

  /**
   * Süzgeçle eşleşen ürün sayısı, listenin süzgeç çevirisinden tek `HEAD` ile; sayaç ve liste aynı kurucudan geçtiği için yeni süzgeç
   * ikisine birden girer. `counts()` yetmez, çünkü RPC yalnız dört süzgeç iletir ve ötekiler sessizce düşerdi.
   */
  async countMatching(filters?: ProductFilters): Promise<number> {
    const { filters: eq, orFilters, isNullFields } = buildProductQuery(filters);
    // Projeksiyon sayımda da geçer: gömülü ilişkide süzen sayım, ilişki select'te yoksa `PGRST108` ile düşer.
    return this.count(eq, { orFilters, select: productSelect(filters), isNullFields });
  }

  private buildQuery(f?: ProductFilters): ProductQuery {
    return buildProductQuery(f);
  }

  /** Tüm ürünler, sayfalamasız; ekranlar kullanmaz (STACK §6), yalnız tamamına ihtiyaç duyan toplu işler içindir. */
  async listAll(): Promise<Product[]> {
    return this.getAll(undefined, { orderBy: 'sortOrder' });
  }

  /** Verilen ürünler tek sorguda; kalem varyant taşır, ad üründedir ve N kalem için N sorgu atılmaz. */
  async listByIds(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] }, { orderBy: 'sortOrder' });
  }

  /**
   * Slug ile tek ürün ve ilişkileri; slug dilden bağımsızdır, paylaşılan bağlantı her dilde aynı ürüne düşer. Bulunamazsa `null`; durum
   * süzgeci çağırana bırakılır, çünkü operasyon önizlemesi pasif ürünü de açar.
   */
  async findBySlug(slug: string): Promise<ProductWithRelations | null> {
    const page = await this.getPageAs(ProductWithRelationsSchema, { slug }, {
      select: productSelect(),
      orderBy: 'sortOrder',
      limit: 1,
    });
    return page.rows[0] ?? null;
  }

  /** Aday ürünler (keşif/tinder bölümü). */
  async listCandidates(): Promise<Product[]> {
    return this.getAll({ status: 'candidate' }, { orderBy: 'sortOrder' });
  }

  /**
   * Ürün + varyantlarını oluşturur. `variants` verilmezse varsayılan tek varyant açılır
   * (fiyat/stok mantığı her yerde varyant üzerinden çalışsın diye).
   */
  async create(input: CreateProductInput): Promise<{ product: Product; variants: ProductVariant[] }> {
    const { variants, ...productFields } = input;
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    // sortOrder verilmezse listenin SONUNA eklenir (kategori/koleksiyonla aynı davranış): DB default'u
    // 0 olduğundan aksi hâlde her yeni ürün mevcutların arasına karışır. Toplu işler (seed) sırayı
    // kendisi verir → fazladan sayım sorgusu atılmaz.
    const sortOrder = productFields.sortOrder ?? (await this.count());
    const product = await this.insert({ ...productFields, sortOrder, slug });

    const variantSvc = new ProductVariantService(this.supabase);
    const toCreate: CreateVariantInput[] = variants && variants.length > 0 ? variants : [{ label: DEFAULT_VARIANT_LABEL }];
    const created: ProductVariant[] = [];
    for (const [i, v] of toCreate.entries()) {
      created.push(await variantSvc.insert({ ...v, productId: product.id, sortOrder: v.sortOrder ?? i }));
    }
    return { product, variants: created };
  }

  /** Görsel anahtarını + sürüm damgasını yazar (R2 yüklemesinden sonra). Relative key; prefix R2'de. */
  async setImageKey(id: string, imageKey: string, dims: ImageDimensions | null = null): Promise<Product> {
    return this.writeImageKey(id, imageKey, dims);
  }

  /**
   * Galerideki fotoğrafı kapak yapar; silme değil takastır, eski kapak seçilenin galerideki yerine geçer ve hiçbir dosya kaybolmaz. Künye
   * bütün olarak el değiştirir, çünkü odak noktası fotoğrafa aittir; yarıda kalan takas en çok aynı dosyayı iki yerde gösterir.
   */
  async makeCover(productId: string, imageId: string): Promise<Product> {
    const imageSvc = new ProductImageService(this.supabase);
    const [product, image] = await Promise.all([this.getById(productId), imageSvc.getById(imageId)]);
    if (!product) throw new Error('Ürün bulunamadı.');
    if (!image || image.productId !== productId) throw new Error('Fotoğraf bu ürüne ait değil.');

    const oldCover = pickImageMeta(product);
    if (oldCover.imageKey) await imageSvc.update({ id: imageId, ...oldCover, imageKey: oldCover.imageKey });
    else await imageSvc.delete(imageId);

    return this.update({ id: productId, ...pickImageMeta(image) });
  }

  /**
   * Ürün alanlarını günceller (yalnız verilenler); slug sabit kalır. Görsel ve varyant ayrı akışlarda yazılır, bu düzenleme formunun
   * temel, içerik ve beyan alanlarıdır.
   */
  async updateDetails(id: string, input: ProductDetailsUpdate): Promise<Product> {
    return this.update({ id, ...input });
  }

  /**
   * Bir ailenin üyeleri, sırasıyla; durum süzgeci çağırana bırakılır, çünkü düzenleme diyaloğu pasif üyeyi de görüp sırasını
   * düzeltebilmeli. Sayfalanmaz: aile operatörün elle kurduğu, doğal tavanı olan bir kümedir (CLAUDE §1).
   */
  listFamilyMembers(familyId: string, opts: { status?: ProductStatus } = {}): Promise<Product[]> {
    return this.getAll(
      { familyId, status: opts.status },
      { orderBy: 'familyPosition', orderDirection: 'asc' },
    );
  }

  /**
   * Aile sırasını tüm aile için birden yazar (`replacePostalCodes` deseni): kısmi yazımda iki eşzamanlı sürükleme sırada sessiz bir delik
   * bırakırdı, tüm aile yazılınca son yazan kazanır.
   */
  async reorderFamily(orders: readonly ProductFamilyOrder[]): Promise<void> {
    if (orders.length === 0) return;
    for (const { productId, position } of orders) {
      await this.update({ id: productId, familyPosition: position });
    }
  }
}

/**
 * Ürün ailesi, çeşit ekseninin kendisi; tablo incedir (kimlik, ad, aktiflik), çünkü üye üründür ve bağ `product` tarafında durur
 * (`family_id`, `family_label`, `family_position`).
 */
export class ProductFamilyService extends BaseDbService<ProductFamily, ProductFamilyInsert, ProductFamilyUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product_family', ProductFamilySchema, ProductFamilyInsertSchema, ProductFamilyUpdateSchema);
  }

  /** Operatörün aile seçicisi — doğal tavanlı küme, tek turda (`CLAUDE §1`). */
  list(opts: { activeOnly?: boolean } = {}): Promise<ProductFamily[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name', orderDirection: 'asc' });
  }
}
