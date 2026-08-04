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
  pickImageMeta,
  resolveLocalizedText,
  LOCALIZED_TEXT_KEYS,
  DEFAULT_PAGE_SIZE,
  type KeysetCursor,
  type Page,
  type ProductStatus,
  type Product,
  type ProductWithRelations,
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
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { ilikeContains, ilikeTerm } from '../utils/filter-term';
import { dbToApp } from '../utils/case-transformers';
import { uniqueSlugForTable } from '../utils/slug';
import { ProductVariantService } from './product-variant.service';
import { ProductImageService } from './product-image.service';

// Ürün listesi süzgeçleri — operasyon ekranının URL parametreleriyle birebir (tek kaynak). Şimdilik
// iç sözleşme: çağıranlar nesne literaliyle geçiyor (tip çıkarımı yeter). Ekran URL'den süzgeç kurmaya
// başlayınca dışa verilir — tipler artımlı büyür (CLAUDE.md §1).
interface ProductFilters {
  /** Ad araması; üç dilde birden aranır. */
  query?: string;
  categoryId?: string;
  /** Ürün ailesi (05.15) — "öteki çeşitler" okuması ve operatörün aile diyaloğu. */
  familyId?: string;
  status?: ProductStatus;
  /** Belirli ürünler — çağıran kimlikleri başka bir okumadan türetmişse (ör. teklifli partiler). */
  ids?: string[];
  /** Yalnız beyanı eksik olanlar (ad dili eksik veya alerjen boş). */
  onlyIncomplete?: boolean;
  /**
   * Yalnız kargolanabilenler — vitrindeki "adresime gönderilebilir" çipi (K32 akışı).
   *
   * Süzgeç SUNUCUDA olmak zorunda: liste keyset ile sayfalanıyor, istemcide süzmek "30 satırın
   * içinde kargolanabilenler" demek olurdu ve sonraki sayfalar sessizce eksik gelirdi.
   */
  onlyShippable?: boolean;
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

// Varyantsız üründe otomatik açılan tek varyantın etiketi: BOŞ çok dilli metin. Eskiden `'default'`
// yazıyordu ve tek boylu ürünün vitrin kartında birim etiketi olarak "default" görünüyordu. Boş etiket
// doğrusu: tek boylu üründe gösterilecek bir boy adı yoktur (resolveLocalizedText '' döner).
const DEFAULT_VARIANT_LABEL = {};

// Yeni varyant girişi — insert şemasından türer (productId create içinde bağlanır). No-duplication.
export type CreateVariantInput = Omit<ProductVariantInsert, 'productId'>;

// Yeni ürün girişi — insert şemasından türer (slug servis türetir) + varyantlar. No-duplication.
export type CreateProductInput = Omit<ProductInsert, 'slug'> & { variants?: CreateVariantInput[] };

/**
 * Varyant seçicilerinin havuz tavanı (paket kalemi · müşteriye özel fiyat). Katalog bunu aşarsa
 * seçici aramalı bir sunucu okumasına döner; o gün gelene kadar tek sorgu yeterli. Tavan tek yerde:
 * iki ekran ayrı sayı tutsaydı biri katalog büyüdüğünde sessizce eksik liste gösterirdi.
 */
export const VARIANT_POOL_LIMIT = 500;

/**
 * Ürün CRUD + varyant orkestrasyonu + koleksiyon bağı. Satılabilir birim her zaman varyant
 * olduğundan varyantsız üründe otomatik varsayılan varyant açılır. Aday ürün (status='candidate')
 * satış/vitrin sorgularının dışında (DOMAIN §13).
 */
/**
 * Süzgeçleri eq-filtrelerine ve `or` gruplarına çevirir — liste, sayaçlar ve fiyat sıralı okuma
 * AYNI çeviriyi kullanır (yoksa "12 sonuç" yazıp 5 satır gösteren ekran doğar).
 *
 * Sınıfın dışında: `ProductListingService` de bunu kullanır ve süzgeç mantığı iki yerde yaşayamaz —
 * kategori süzgeci sıralamaya göre farklı davranırsa katalog kendi kendisiyle çelişir.
 */
function buildProductQuery(f?: ProductFilters): { filters: Record<string, unknown>; orFilters: string[] } {
  const filters: Record<string, unknown> = {};
  const orFilters: string[] = [];
  if (f?.categoryId) filters.categoryId = f.categoryId;
  if (f?.familyId) filters.familyId = f.familyId;
  if (f?.ids) filters.id = f.ids; // dizi → IN (base sorgu kurucusu çevirir)
  if (f?.status) filters.status = f.status; // tek kolon → düz eşitlik (eski ikili bayrak çevrimi kalktı)

  // Terim kaçışı tek kaynakta (`ilikeTerm`). Arama ÜRÜN ADINDA ve üç dilin hepsinde: jsonb alanı
  // dil dil açılır, biri tutarsa satır kalır.
  const safe = ilikeTerm(f?.query);
  if (safe) {
    orFilters.push(LOCALIZED_TEXT_KEYS.map((l) => ilikeContains(`name->>${l}`, safe)).join(','));
  }

  // "Beyan eksik" ölçütü ÜRETİLMİŞ KOLONDA (0005 `is_incomplete`): süzgeç de sayaç da aynı gerçeği
  // okur. Kural veritabanına taşınınca ayrışma riski ortadan kalktı (ve indekslendi).
  if (f?.onlyIncomplete) filters.isIncomplete = true;
  if (f?.onlyShippable) filters.shippable = true;
  return { filters, orFilters };
}

/**
 * **Fiyata göre sıralı katalog** (08.10) — `product_listing` görünümü (0043).
 *
 * Kendi sınıfı olmasının sebebi teknik: keyset sayfalama `tableName`'e bağlıdır ve sıralama anahtarı
 * (`sort_price`) yalnız görünümde vardır (`OrderSaleService` ile aynı gerekçe). Süzgeçler paylaşılır
 * (`buildProductQuery`), satır şeması paylaşılır (`ProductWithRelationsSchema`) — ayrışan tek şey
 * hangi kaynaktan ve hangi sıraya göre okunduğu.
 *
 * **Sıralamanın kullandığı fiyat, kartta yazan fiyattır.** Görünüm motorun ziyaretçi dalını yeniden
 * ifade eder (0043 başlığındaki ödünleşme); ikisinin ayrışmadığı testle tutulur.
 */
export class ProductListingService extends BaseDbService<ProductWithRelations, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'product_listing',
      ProductWithRelationsSchema,
      ProductWithRelationsSchema as never,
      ProductWithRelationsSchema as never,
      false,
    );
  }

  /**
   * Fiyata göre sayfa. Fiyatı olmayan ürün (kanal fiyatı girilmemiş → satışa kapalı) listeden
   * DÜŞMEZ, sonda durur — görünümdeki `sort_price` sonsuzdur (0043).
   *
   * ── DEPO SÜZGECİ ZORUNLU, YOKLUĞU DA BİR DEĞER ──────────────────────────────
   * Görünüm depo boyutu aldı (0043): her ürün için aktif depo sayısı kadar satır + yeri bilinmeyen
   * okuma için bir satır. Süzgeç uygulanmazsa **aynı ürün sayfada birkaç kez görünür** ve keyset
   * imleci bozulur — `sort_price` artık tek başına benzersiz bir sıra vermez.
   *
   * `warehouseId` null = yer bilinmiyor → görünümdeki `warehouse_id is null` satırı okunur: liste
   * fiyatıyla sıralanır, near-expiry teklif TUTARI gösterilmez (yalnız `has_near_expiry_offer`
   * bayrağı). Bu bir eksiklik değil, verilen sözün korunmasıdır: teklif bir depodadır ve
   * ziyaretçinin posta kodu oraya düşmeyebilir.
   */
  async listByPrice(
    opts: ProductListOptions & { direction: 'asc' | 'desc'; warehouseId?: string | null },
  ): Promise<Page<ProductWithRelations>> {
    const { filters, orFilters } = buildProductQuery(opts.filters);
    // Yer belliyse depo satırı, belli değilse `warehouse_id is null` satırı — ikisi ayrı süzgeç
    // biçimi: null'a `eq` uygulanamaz.
    const scoped = opts.warehouseId ? { ...filters, warehouseId: opts.warehouseId } : filters;
    return this.getPageAs(ProductWithRelationsSchema, scoped, {
      select: '*,variants:product_variant(*),collections:product_collections(collection_id)',
      orderBy: 'sortPrice',
      orderDirection: opts.direction,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      isNullFields: opts.warehouseId ? undefined : ['warehouse_id'],
    });
  }
}

export class ProductService extends BaseDbService<Product, ProductInsert, ProductUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'product', ProductSchema, ProductInsertSchema, ProductUpdateSchema);
  }

  /**
   * Admin listesi: SÜZÜLMÜŞ ve SAYFALANMIŞ (keyset). Süzme sunucuda yapılır — client tam listeyi
   * çekip filtrelemez (STACK §6). Sıra `sortOrder` + `id` (deterministik, imleç kaymaz).
   *
   * Süzgeçler ve DB karşılıkları:
   *  · `query`      → ad (jsonb) ÜÇ dilde `ilike` — tek `or` grubu
   *  · `categoryId` → eq
   *  · `status`     → tek kolon (`product_status` enum'u) — düz eşitlik
   *  · `onlyIncomplete` → beyanı eksik: ad dillerinden biri YOK **veya** alerjen listesi boş
   */
  async list(opts: ProductListOptions = {}): Promise<Page<Product>> {
    const { filters, orFilters } = this.buildQuery(opts.filters);
    return this.getPage(filters, {
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
    });
  }

  /**
   * Stok ekranının ürün sayfası (09.13) — `list()` ile AYNI süzme/sayfalama, ama satır dar ve
   * boylarla gelir.
   *
   * Neden ayrı bir okuma: stok listesinin satırı boydur ("Fıstıklı Baklava · 1 kg"), ama aradığı
   * alanların yarısı (tarih tipi, raf ömrü, kategori) ÜRÜNDE durur. `listWithRelations` bunu da
   * verirdi — beyan metinleri, besin künyesi ve alerjenlerle birlikte; oysa stok ekranı onların
   * hiçbirine bakmaz. Havuzun (`listPool`) gerekçesiyle aynı: satır sayısı değil, satır GENİŞLİĞİ.
   *
   * Aday ürünler de gelir ve bu bilinçli: adayın stoğu girilmiş olabilir (numune, deneme partisi) —
   * süzmek "depoda duran malı listede göremiyorum" demek olurdu. Satılamaz olması ekranın söyleyeceği
   * bir şeydir, saklayacağı değil.
   */
  async listStockRows(opts: ProductListOptions = {}): Promise<Page<ProductStockRow>> {
    const { filters, orFilters } = this.buildQuery(opts.filters);
    return this.getPageAs(ProductStockRowSchema, filters, {
      // `sort_order` GÖRÜNÜM için değil, İMLEÇ için: sayfa ona göre sıralanıyor ve keyset imleci son
      // satırın bu değerinden kuruluyor (bkz. `pageOf`). Dar şema onu taşımaz — Zod düşürür, ham
      // satırda okunur. Select'ten çıkarsa ikinci sayfa istenemez ve `pageOf` bunu fırlatarak söyler.
      select:
        'id,sort_order,name,category_id,date_type,shelf_life_days,status,variants:product_variant(id,label,is_active,min_stock_qty,sku)',
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
    });
  }

  /**
   * Fiyat ekranının ürün sayfası (09.5) — `listStockRows` ile aynı süzme/sayfalama, farklı dar satır.
   *
   * Ayrı bir okuma olmasının gerekçesi stok satırınınkiyle aynı: taşınan alanlar farklı. Fiyat
   * ekranı tarih rejimini ve eşiği hiç okumaz; okuduğu dört alanın (KDV oranı, hedef marj,
   * `auto_price`, kategori) üçü stok satırında YOK. İkisini tek geniş okumada birleştirmek her iki
   * ekrana da öbürünün alanlarını ödetirdi.
   */
  async listPriceRows(opts: ProductListOptions = {}): Promise<Page<ProductPriceRow>> {
    const { filters, orFilters } = this.buildQuery(opts.filters);
    return this.getPageAs(ProductPriceRowSchema, filters, {
      // Baştaki `sort_order` ÜRÜNÜN kendisininki — imleç ona dayanır (bkz. `listStockRows` notu).
      // Sondaki, gömülü seçimin içindeki ise BOYUN sıra numarası; ikisi ayrı alanlar. Eskiden yalnız
      // ikincisi vardı ve "sort_order geçiyor" diye bakan göz farkı görmüyordu — hata orada saklandı.
      select:
        'id,sort_order,name,category_id,vat_rate,target_margin_percent,auto_price,status,variants:product_variant(id,label,is_active,sort_order)',
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
    });
  }

  /**
   * Otomatik fiyatlı ürünler — hedef marjı OLANLAR (hedefsizde hesaplanacak bir fiyat yoktur).
   *
   * Katalog süzgeci değil, bir İŞİN girdisi: toplu fiyat hizalaması bu kümeyi dolaşır. Sayfalama
   * yerine üst sınır alır; çağıran sınırın aşıldığını görür (`repriceAllAuto`), sessiz kırpma yok.
   */
  async listAutoPriced(limit: number): Promise<Product[]> {
    return this.getAll({ autoPrice: true }, { isNotNullFields: ['target_margin_percent'], orderBy: 'sortOrder', limit });
  }

  /**
   * `list()` ile aynı süzme/sayfalama, AMA varyantlar ve koleksiyon üyelikleri de aynı turda gelir.
   * Operasyon ekranı bunu kullanır: ürün başına ayrı varyant sorgusu + koleksiyon başına ayrı üyelik
   * sorgusu (N+1) yerine TEK sorgu. Takma adlar (`variants:` / `collections:`) sayesinde PostgREST
   * tablo adları domain tipine sızmaz (STACK §13 — N+1'i kırmanın ilk aracı gömülü select).
   */
  async listWithRelations(opts: ProductListOptions = {}): Promise<Page<ProductWithRelations>> {
    const { filters, orFilters } = this.buildQuery(opts.filters);
    return this.getPageAs(ProductWithRelationsSchema, filters, {
      select: '*,variants:product_variant(*),collections:product_collections(collection_id)',
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
    });
  }

  /**
   * Paket seçicisinin havuzu: TÜM katalog ama DAR alanlarla (kimlik · durum · KDV · hedef marj · boylar).
   *
   * `listWithRelations` ile okunuyordu ve ürün başına beyan metinleri, besin değerleri, alerjenler de
   * geliyordu — 500 ürünlük katalogda 113 KB'lık bir yükün neredeyse tamamı kullanılmadan atılıyordu.
   * Satır sayısı değil satır GENİŞLİĞİ pahalıydı. Süzgeç yok: havuz hem "eklenebilirler" hem "pakette
   * duran kalemin adı" sorusuna hizmet ediyor (pasif ürün de adıyla görünmeli).
   */
  async listPool(limit: number, productIds?: readonly string[]): Promise<ProductPool[]> {
    // Kimlik verilirse havuz o ürünlere daralır: aramalı seçicide önce eşleşme bulunur, havuz
    // yalnız BULUNANLAR için okunur — katalogun tamamını çekmenin yerini bu alır.
    if (productIds && productIds.length === 0) return [];
    return this.getAllAs(ProductPoolSchema, productIds ? { id: [...productIds] } : undefined, {
      select: 'id,name,image_key,image_updated_at,status,vat_rate,target_margin_percent,variants:product_variant(id,label,is_active)',
      orderBy: 'sortOrder',
      limit,
    });
  }

  /**
   * Ekran başlığı ve kategori listesi sayaçları — TEK okuma (`product_counts()`).
   *
   * Önce dört ayrı istek gidiyordu: üç `HEAD` sayım + kategori sayaçları için TÜM ürünlerin
   * `category_id`'sini çeken bir okuma (katalog büyüdükçe büyüyen bir yük). Dört sayı için dört tur.
   * Fonksiyon iş kuralı taşımaz: "beyan eksik" ölçütü `product.is_incomplete` üretilmiş kolonunda
   * tek kaynakta, buradaki süzgeçler mekanik eşleşme.
   *
   * `byCategory` bilinçli olarak SÜZGEÇSİZ: kategori listesinin kendi sayısıdır, ürün süzgecinden
   * bağımsız. Aday sayacı da durum süzgecini yok sayar (aday kuyruğu her hâlde görünmeli).
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

  private buildQuery(f?: ProductFilters): { filters: Record<string, unknown>; orFilters: string[] } {
    return buildProductQuery(f);
  }

  /**
   * TÜM ürünler, sayfalamasız. **Ekranlar kullanmaz** (STACK §6: ~200 satırı geçebilen liste sunucuda
   * süzülür ve sayfalanır → `list()`); bu uç yalnız tamamına ihtiyaç duyan toplu işler içindir: seed,
   * bakım betikleri, dışa aktarma.
   */
  async listAll(): Promise<Product[]> {
    return this.getAll(undefined, { orderBy: 'sortOrder' });
  }

  /**
   * Verilen ürünler TEK sorguda — kalem listesinden ada çıkmak için (sipariş bildirimi, 14.5).
   * Kalem varyant taşır, ad üründedir; N kalem için N sorgu atmamak adına toplu okunur.
   */
  async listByIds(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] }, { orderBy: 'sortOrder' });
  }

  /**
   * Slug ile TEK ürün + varyantları. Müşteri ürün sayfasının girişidir: URL slug taşır, slug
   * dil-bağımsızdır (içerikten türer), bu yüzden paylaşılan link her dilde aynı ürüne düşer.
   *
   * Bulunamazsa `null` — çağıran 404'e çevirir. Durum süzgeci ÇAĞIRANA bırakılır: vitrin yalnız
   * `active` ister, operasyon önizlemesi pasif ürünü de açabilmelidir.
   */
  async findBySlug(slug: string): Promise<ProductWithRelations | null> {
    const page = await this.getPageAs(ProductWithRelationsSchema, { slug }, {
      select: '*,variants:product_variant(*),collections:product_collections(collection_id)',
      orderBy: 'sortOrder',
      limit: 1,
    });
    return page.rows[0] ?? null;
  }

  /** Satılabilir katalog: yalnız satışta olanlar (aday ve pasif hariç). */
  async listSellable(): Promise<Product[]> {
    return this.getAll({ status: 'active' }, { orderBy: 'sortOrder' });
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

  /** Satış durumunu yazar (satışta / pasif / aday). */
  async setStatus(id: string, status: ProductStatus): Promise<Product> {
    return this.update({ id, status });
  }

  /** Görsel anahtarını + sürüm damgasını yazar (R2 yüklemesinden sonra). Relative key; prefix R2'de. */
  async setImageKey(id: string, imageKey: string): Promise<Product> {
    return this.writeImageKey(id, imageKey);
  }

  /**
   * Galerideki bir fotoğrafı KAPAK yapar. Silme değil TAKAS: eski kapak, seçilen fotoğrafın galerideki
   * yerine geçer (sırası korunur) — operatör "aslında üçüncüsü daha iyi" dediğinde hiçbir dosya
   * kaybolmaz, yeniden yükleme gerekmez. Ürünün henüz kapağı yoksa satır galeriden çıkar.
   *
   * Künye (dosya + odak + zoom + alt + damga) bir BÜTÜN olarak el değiştirir (`pickImageMeta`):
   * odak noktası fotoğrafın kendisine aittir, çerçeveye değil — takasta korunmalı.
   *
   * İki tabloya yazar ama RPC eşiğini karşılamaz (STACK §13): yarıda kalırsa veri bozulmaz, en kötü
   * ihtimalle aynı dosya hem kapakta hem galeride görünür — operatör tekrar tıklayınca düzelir.
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
   * Ürün alanlarını günceller (yalnız verilenler). Slug rename'de sabit kalır. Görsel ve varyant
   * düzenleme ayrı akışlarda — bu, düzenleme formunun "Temel + içerik + beyan" alanlarını yazar.
   */
  async updateDetails(id: string, input: ProductDetailsUpdate): Promise<Product> {
    return this.update({ id, ...input });
  }

  /**
   * **Bir ailenin üyeleri, sırasıyla** (05.15).
   *
   * `status` süzgeci ÇAĞIRANA bırakılır — `findBySlug` ile aynı gerekçe: vitrin yalnız satıştakini
   * ister, operasyonun düzenleme diyaloğu ise **tüm aileyi** görmek zorundadır (kullanıcı kararı:
   * "her ürünün düzenleme diyaloğunda tüm aile görünür"). Süzgeci buraya gömseydik operatör
   * pasiflediği üyeyi listede bulamaz ve sırasını düzeltemezdi.
   *
   * Sayfalanmıyor ve bu bilinçli: aile operatörün elle kurduğu, doğal tavanı olan bir kümedir
   * (`CLAUDE §1`) — brief 2 ile 10+ arası bir boy öngörüyor.
   */
  listFamilyMembers(familyId: string, opts: { status?: ProductStatus } = {}): Promise<Product[]> {
    return this.getAll(
      { familyId, status: opts.status },
      { orderBy: 'familyPosition', orderDirection: 'asc' },
    );
  }

  /**
   * **Aile sırasını TÜM AİLE İÇİN birden yazar** (`replacePostalCodes` deseni).
   *
   * Kısmi güncelleme yazsaydık iki operatör iki ayrı üyenin diyaloğundan aynı anda sürüklediğinde
   * sıralama delik kalırdı — ve hiçbir yer hata vermezdi, kartlar yalnız bir gün başka sırada
   * görünürdü. Tüm aile tek turda yazılınca son yazan kazanır ve sonuç her hâlde tutarlıdır.
   */
  async reorderFamily(orders: readonly ProductFamilyOrder[]): Promise<void> {
    if (orders.length === 0) return;
    for (const { productId, position } of orders) {
      await this.update({ id: productId, familyPosition: position });
    }
  }
}

/**
 * **ÜRÜN AİLESİ** (05.15) — çeşit ekseninin kendisi.
 *
 * Tablo ince: kimlik + operasyona görünen ad + aktiflik. Bütün ağırlık `product` tarafında
 * (`family_id` · `family_label` · `family_position`), çünkü **üye = ürün**; aile onların üstünde
 * ince bir gruplamadır, yeni bir varlık türü değil.
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
