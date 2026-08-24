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
  /**
   * **Koleksiyon üyeliği** (05.18) — katalogun koleksiyon hâli (`/catalog?collection=<slug>`).
   *
   * Kategori gibi bir kolon DEĞİL, junction (`product_collections`): bir ürün çok koleksiyona girer.
   * Bu yüzden gömülü ilişki üzerinden süzülüyor (`collections.collection_id`) — PostgREST bunu
   * sunucuda join'e çeviriyor, yani sayfalama ve sayaçlar bozulmuyor.
   *
   * **İstemcide süzmek YANLIŞ olurdu** ve sebebi `onlyShippable` ile aynı: liste keyset sayfalı,
   * istemcide süzmek "30 satırın içindeki koleksiyon üyeleri" demek olur ve sonraki sayfalar
   * sessizce eksik gelirdi.
   *
   * **Kürasyon SIRASI burada YOK.** `product_collections.position` koleksiyon sayfasının sırasıdır;
   * katalog kendi sırasını (`sortOrder`) kullanır. İkisini birleştirmek, aynı listenin iki sıraya
   * birden uyması demekti — koleksiyon görünümü tasarımda katalogun bir HÂLİ (başlık bandı değişir,
   * süzgeç/sıralama satırı aynen kalır), ayrı bir kürasyon sayfası değil.
   */
  collectionId?: string;
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
/**
 * **Ürün projeksiyonu — koleksiyon süzgeci varsa gömülü ilişki `!inner` olur.**
 *
 * Tek fonksiyon, çünkü kural iki yerde birden geçerli ve ayrışırsa arıza SESSİZ olur: liste doğru
 * süzer, sayaç süzmez ve ekran "24 sonuç" yazıp 119 kart çizer (ya da tersi).
 *
 * **Koşullu, çünkü `!inner` sabit olsaydı HİÇBİR koleksiyonda olmayan ürün katalogdan düşerdi** —
 * bugün 133 ürünün büyük çoğunluğu öyle. Süzgeç yokken ilişki yalnız gösterim içindir (kartın
 * hangi koleksiyonlarda olduğunu bilmesi için) ve LEFT kalmalı.
 *
 * `product_listing` görünümünde de çalışıyor (ölçüldü: `!inner` + depo süzgeci → 24, junction ile
 * birebir). Görünümde depo süzgeci ZATEN zorunlu — onsuz aynı ürün depo sayısı kadar tekrarlar
 * (`!inner` bunu 72'ye çıkarıyordu, yani süzgeç doğru çalışsa bile sayı depo boyutuyla şişerdi).
 */
function productSelect(f?: ProductFilters): string {
  const collections = f?.collectionId
    ? 'collections:product_collections!inner(collection_id)'
    : 'collections:product_collections(collection_id)';
  return `*,variants:product_variant(*),${collections}`;
}

function buildProductQuery(f?: ProductFilters): { filters: Record<string, unknown>; orFilters: string[] } {
  const filters: Record<string, unknown> = {};
  const orFilters: string[] = [];
  if (f?.categoryId) filters.categoryId = f.categoryId;
  if (f?.familyId) filters.familyId = f.familyId;
  // Koleksiyon üyeliği GÖMÜLÜ İLİŞKİ üzerinden (junction) — kategori gibi bir kolon değil.
  // **Süzgecin işe yaraması için projeksiyonun `!inner` olması ŞART** (`productSelect`); ilk
  // yazımda değildi ve künyesi "PostgREST bunu sunucuda join'e çeviriyor" diyordu — join kuruluyordu
  // ama LEFT. Ölçüldü (08.08, 24 üyeli koleksiyon): `!inner`siz **119** (tüm aktif katalog),
  // `!inner`li **24** (junction'ın kendisiyle birebir). Yani süzgeç sessizce "hepsi" diyordu.
  if (f?.collectionId) filters['collections.collection_id'] = f.collectionId;
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
 * **Görünümün KAPSAMI** (08.54) — vitrinin her okuması bunu kurmak zorunda.
 *
 * `product_listing` grain'i `(depo × kanal × ürün)`. İki eksenden biri süzülmezse aynı ürün sayfada
 * birkaç kez görünür ve keyset imleci bozulur. Tek nesnede durmalarının sebebi bu: üç okuma
 * (varsayılan sıra · fiyat sırası · sayaç) aynı kapsamı kurmalı, yoksa "24 sonuç" yazıp 17 kart
 * çizen ekran doğar — bu depoda bir kez yaşandı (08.10 künyesi).
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
 * **Vitrinin katalog okuması** (08.10 · 08.46 · 08.54) — `product_listing` görünümü (0032).
 *
 * Kendi sınıfı olmasının sebebi teknik: keyset sayfalama `tableName`'e bağlıdır ve hem sıralama
 * anahtarı (`sort_price`) hem kapsam kolonları (`channel`, `warehouse_id`) yalnız görünümde vardır
 * (`OrderSaleService` ile aynı gerekçe). Süzgeçler paylaşılır (`buildProductQuery`); satır şeması
 * ise ürününkinden TÜRER ama aynısı DEĞİL (`ProductListingRowSchema` = ürün + kapsam + görünümün
 * hesapladığı kolonlar).
 *
 * **Üç okuma da BURADA** (08.46) ve bu şart: görünüm artık kanalında satılamayan ürünü süzüyor.
 * Varsayılan sıra `ProductService`ten okunmaya devam etseydi katalog, sıralama seçilince başka,
 * seçilmeyince başka bir ürün kümesi gösterirdi.
 *
 * **Operasyon bu sınıfı KULLANMAZ** — ürün listesi `ProductService` üzerinden ham `product`
 * tablosundan gelir ve gelmeye devam etmeli: operatör tam olarak eksik fiyatlı ürünü görmek
 * zorunda, onu düzeltecek olan o.
 *
 * **Sıralamanın kullandığı fiyat, kartta yazan fiyattır.** Görünüm motorun LİSTE dalını yeniden
 * ifade eder (0032 başlığındaki ödünleşme); ikisinin ayrışmadığı testle tutulur — ve test artık
 * iki kanalı da koşar (08.54: dört ay boyunca yalnız ziyaretçi dalı ölçülmüştü).
 */
export class ProductListingService extends BaseDbService<ProductListingRow, never, never> {
  /**
   * `*,variants:product_variant(*)` + koleksiyon bağı (`listingSelect`) — bkz. `BaseDbService.embeds`.
   *
   * **Bu beyan ilk turda ATLANMIŞTI** ve arıza tam da tasarımın vaat ettiği gibi çıktı: gömülü
   * satır `snake_case` kaldı, şema `variants[0].productId`i bulamadı ve sorgu **o anda** patladı
   * (`ProductListing` müşteri kataloğunun ve mobil ucun okuma yolu). Ters varsayılanın gerekçesi
   * buydu — beyanı unutmak veriyi sessizce bozmuyor, ekranı hemen kırıyor.
   */
  protected override readonly embeds = ['variants', 'collections'];

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
   * Kapsamı eq-süzgeçlerine çevirir. **Yer belliyse depo satırı, belli değilse `warehouse_id is
   * null` satırı** — ikisi ayrı süzgeç biçimi çünkü null'a `eq` uygulanamaz; o yüzden ikinci
   * parçayı `isNullFields` taşıyor (`scopeOptions`). Kanalın böyle bir ikiliği yok, her zaman eq.
   *
   * Tek yerde durmasının sebebi üç okumanın aynı kapsamı kurma zorunluluğu — `ProductListingScope`
   * künyesi.
   */
  private scopedFilters(filters: Record<string, unknown>, scope: ProductListingScope): Record<string, unknown> {
    return { ...filters, channel: scope.channel, ...(scope.warehouseId ? { warehouseId: scope.warehouseId } : {}) };
  }

  /** Kapsamın `eq` ile ifade edilemeyen yarısı: "yer bilinmiyor" satırı. */
  private scopeOptions(scope: ProductListingScope): { isNullFields?: string[] } {
    return scope.warehouseId ? {} : { isNullFields: ['warehouse_id'] };
  }

  /**
   * **Katalogun VARSAYILAN sırası** (`sort_order` — operatörün sırası), görünümden okunur.
   *
   * Eskiden `ProductService.listWithRelations` ile ham `product` tablosundan geliyordu ve fiyata
   * hiç teması yoktu. 08.46 kanalında satılamayan ürünü süzünce o hâl tutarsızlaştı: aynı katalog
   * "artan fiyat" seçiliyken süzülmüş, "öne çıkanlar"dayken süzülmemiş bir küme gösterirdi.
   *
   * Geçiş bedelsiz çünkü görünüm `p.*` seçiyor — ürün tablosunun ÜST KÜMESİ. Süzgeç kurucusu ve
   * projeksiyon zaten ortaktı; değişen tek şey hangi kaynaktan okunduğu.
   */
  async list(opts: ProductListOptions & ProductListingScope): Promise<Page<ProductListingRow>> {
    const { filters, orFilters } = buildProductQuery(opts.filters);
    // **Şema GÖRÜNÜMÜN satırı, ürünün değil** (07.08): önceki hâl `ProductWithRelationsSchema` ile
    // parse ediyordu ve Zod tanımadığı alanları düşürüyordu — görünüm `effective_price` ile
    // `has_near_expiry_offer`i hesaplıyor, servis çöpe atıyordu. Hiçbir yerde hata vermiyordu;
    // yalnız her tüketici fiyatı ikinci kez hesaplamak zorunda kalıyordu.
    return this.getPageAs(ProductListingRowSchema, this.scopedFilters(filters, opts), {
      select: productSelect(opts.filters),
      orderBy: 'sortOrder',
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      ...this.scopeOptions(opts),
    });
  }

  /**
   * Fiyata göre sayfa. **Kanalında fiyatı olmayan ürün listede HİÇ YOKTUR** (08.46) — görünüm onu
   * süzer, yani buraya gelen her satırın fiyatı vardır ve `sort_price` asla null değildir.
   *
   * ── İKİ EKSEN DE ZORUNLU, YOKLUĞU DA BİR DEĞER ──────────────────────────────
   * Görünüm önce depo (0032 · 01.08), sonra KANAL boyutu aldı (08.54). Süzgeçlerden biri
   * uygulanmazsa **aynı ürün sayfada birkaç kez görünür** ve keyset imleci bozulur — `sort_price`
   * artık tek başına benzersiz bir sıra vermez.
   *
   * **Kapsam VARSAYILANSIZ ve bu bilinçli.** `warehouseId` eskiden `?` ile isteğe bağlıydı ve
   * künyesi "zorunlu" diyordu — tip ile künye ayrışmıştı. Varsayılan bırakmak tam olarak 08.54'ün
   * düzelttiği kusuru üretir: argümanı unutan çağrı DERLENİR ve sessizce yanlış kapsamı okur.
   * Kanal için aynı tuzak daha sinsi olurdu — tek kanallı veride doğru cevap verir, ikinci kanal
   * açılınca sessizce yanlışa döner. Bu kusur tam olarak öyle dört ay yaşadı.
   */
  async listByPrice(
    opts: ProductListOptions & ProductListingScope & { direction: 'asc' | 'desc' },
  ): Promise<Page<ProductListingRow>> {
    const { filters, orFilters } = buildProductQuery(opts.filters);
    return this.getPageAs(ProductListingRowSchema, this.scopedFilters(filters, opts), {
      select: productSelect(opts.filters),
      orderBy: 'sortPrice',
      orderDirection: opts.direction,
      limit: opts.limit ?? DEFAULT_PAGE_SIZE,
      keysetAfter: opts.cursor,
      orFilters,
      ...this.scopeOptions(opts),
    });
  }

  /**
   * **Site haritasının ürünleri** — herkese açık URL'ler, yani ZİYARETÇİ kapsamı: `b2c` ve yeri
   * bilinmeyen okuma.
   *
   * Eskiden `ProductService.listSellable()`ti ve **adı sözünü tutmuyordu**: yalnız `status='active'`
   * süzüyordu, satılabilirliğe hiç bakmıyordu. Sonucu ölçülebilir bir tutarsızlıktı — yalnız toptana
   * fiyatlanmış bir ürünün herkese açık adresi haritaya yazılıyor, arama motoru anonim ziyaretçinin
   * satın alamayacağı bir sayfaya çağrılıyordu.
   *
   * Sayfalama YOK ve olmamalı: harita kümenin tamamıdır. Tavanı da yok — büyürse haritanın kendi
   * bölünme kuralı devreye girer, listenin sayfa boyu değil.
   */
  async listSellable(): Promise<ProductListingRow[]> {
    return this.getAllAs(
      ProductListingRowSchema,
      this.scopedFilters({ status: 'active' }, { warehouseId: null, channel: 'b2c' }),
      { select: productSelect(undefined), orderBy: 'sortOrder', ...this.scopeOptions({ warehouseId: null, channel: 'b2c' }) },
    );
  }

  /**
   * Başlıktaki sonuç sayısı — **listeyle AYNI kaynaktan, AYNI süzgeçle, AYNI kapsamla**.
   *
   * `ProductService.countMatching` ham `product` tablosunu sayıyor ve kanal/depo kapsamını
   * bilmiyor; 08.46'dan sonra o sayaç süzülmemiş kümeyi sayardı. Ayrışmanın sonucu bu depoda
   * bilinen bir arıza: *"çip açıkken liste 1 satır basarken başlık 131 diyordu"* (08.10 künyesi).
   */
  async countMatching(filters: ProductFilters | undefined, scope: ProductListingScope): Promise<number> {
    const { filters: eq, orFilters } = buildProductQuery(filters);
    // Projeksiyon sayımda da geçer: gömülü ilişkide süzen bir sayım, ilişki select'te yoksa
    // `PGRST108` ile patlar (`ProductService.countMatching` künyesindeki ölçüm).
    return this.count(this.scopedFilters(eq, scope), {
      orFilters,
      select: productSelect(filters),
      ...this.scopeOptions(scope),
    });
  }
}

export class ProductService extends BaseDbService<Product, ProductInsert, ProductUpdate> {
  /** `variants:product_variant(...)` + `collections:product_collections(...)` (bkz. `BaseDbService.embeds`). */
  protected override readonly embeds = ['variants', 'collections'];

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
        'id,sort_order,name,category_id,date_type,shelf_life_days,status,image_key,image_updated_at,variants:product_variant(id,label,is_active,min_stock_qty,sku)',
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
        'id,sort_order,name,category_id,vat_rate,target_margin_percent,target_margin_b2b_percent,auto_price,status,image_key,image_updated_at,variants:product_variant(id,label,is_active,sort_order)',
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
      select: productSelect(opts.filters),
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
   *
   * ⚠ **SÜZGEÇ KÜMESİ DAR ve bu bir sınır, eksik değil:** RPC'ye yalnız dördü gidiyor
   * (`query · category · status · onlyIncomplete`). `ids` ve `onlyShippable` ile çağırırsanız
   * **sessizce yok sayılırlar** — bu okumayı OPERASYON ekranı için tasarlandığı gibi kullanın
   * (`0019` künyesi: *"müşteri yüzeyine açılmaz"*). Süzgeciyle eşleşen sayıyı isteyen çağıran
   * {@link countMatching} kullanır; vitrin 07.08'de oraya taşındı.
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
   * Süzgeçle EŞLEŞEN ürün sayısı — listenin kullandığı çeviriden (`buildProductQuery`), tek `HEAD`.
   *
   * **Neden `counts()` yetmedi** (07.08, ölçüldü): o okuma RPC'ye yalnız dört süzgeç iletiyor;
   * vitrin ise altı ile çağırıyordu (`ids` = "yalnız indirimliler" köprüsü, `onlyShippable` =
   * "adresime gönderilebilir"). İkisi sessizce düşüyor ve başlık listeyle çelişiyordu — yerelde
   * ölçüldü: liste 1 ürün basarken başlık **131** diyordu. Hata fırlatmıyordu, çünkü çağrı tip
   * olarak kusursuz: tam nesne veriliyor, içeride dördü kullanılıp ikisi atılıyor.
   *
   * **Tutarlılık burada YAPISAL:** sayaç da liste de aynı `ProductFilters` nesnesini aynı
   * kurucudan geçiriyor. Yeni bir süzgeç eklendiğinde ikisi birden büyür — kimsenin bir RPC'yi
   * güncellemeyi hatırlaması gerekmez. Kırılan tam olarak buydu.
   *
   * Bedeli bir tur: `counts()` dört sayıyı tek okumada veriyordu, bu yalnız birini verir. Vitrin
   * zaten öteki üçünü (aday · beyan eksik · kategori kırılımı) hiç okumuyordu — operatör
   * kavramları. (Denetim kararı 07.08: A yerine B; ölçüm gerekirse uygulandıktan sonra.)
   */
  async countMatching(filters?: ProductFilters): Promise<number> {
    const { filters: eq, orFilters } = buildProductQuery(filters);
    // **Projeksiyon sayımda da geçiyor** ve şart: gömülü ilişkide süzen bir sayım, ilişki select'te
    // yoksa `PGRST108` ile patlar (ölçüldü — ana sayfa `/tr` bu yüzden düştü, `digest 2878299763`).
    // Aynı `productSelect` kullanılıyor: listenin süzdüğü küme ile sayacın saydığı küme ayrışamaz.
    return this.count(eq, { orFilters, select: productSelect(filters) });
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

  /* `listSellable` BURADAN KALKTI (08.46 · 24.08) — `ProductListingService`e taşındı.
     Adı "satılabilir" diyordu ama yalnız `status`a bakıyordu; satılabilirlik kanal fiyatını da
     gerektiriyor ve o bilgi ürün tablosunda YOK. Tek çağıranı site haritasıydı. */

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
