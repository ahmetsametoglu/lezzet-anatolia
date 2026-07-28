import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ProductSchema,
  ProductInsertSchema,
  ProductUpdateSchema,
  ProductPoolSchema,
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
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
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
  status?: ProductStatus;
  /** Belirli ürünler — çağıran kimlikleri başka bir okumadan türetmişse (ör. teklifli partiler). */
  ids?: string[];
  /** Yalnız beyanı eksik olanlar (ad dili eksik veya alerjen boş). */
  onlyIncomplete?: boolean;
}

interface ProductListOptions {
  filters?: ProductFilters;
  cursor?: KeysetCursor;
  limit?: number;
}

// Gruplu sayım satırı — bir ENTITY değil, tek sorguya özgü projeksiyon; bu yüzden packages/types'ta
// değil burada yaşar (domain şeması değil, sorgu çıktısı sözleşmesi).
const CategoryCountRowSchema = z.object({ categoryId: z.string().uuid() });

// Varyantsız üründe otomatik açılan tek varyantın etiketi: BOŞ çok dilli metin. Eskiden `'default'`
// yazıyordu ve tek boylu ürünün vitrin kartında birim etiketi olarak "default" görünüyordu. Boş etiket
// doğrusu: tek boylu üründe gösterilecek bir boy adı yoktur (resolveLocalizedText '' döner).
const DEFAULT_VARIANT_LABEL = {};

// Yeni varyant girişi — insert şemasından türer (productId create içinde bağlanır). No-duplication.
export type CreateVariantInput = Omit<ProductVariantInsert, 'productId'>;

// Yeni ürün girişi — insert şemasından türer (slug servis türetir) + varyantlar. No-duplication.
export type CreateProductInput = Omit<ProductInsert, 'slug'> & { variants?: CreateVariantInput[] };

/**
 * Ürün CRUD + varyant orkestrasyonu + koleksiyon bağı. Satılabilir birim her zaman varyant
 * olduğundan varyantsız üründe otomatik varsayılan varyant açılır. Aday ürün (status='candidate')
 * satış/vitrin sorgularının dışında (DOMAIN §13).
 */
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
  async listPool(limit: number): Promise<ProductPool[]> {
    return this.getAllAs(ProductPoolSchema, undefined, {
      select: 'id,name,image_key,image_updated_at,status,vat_rate,target_margin_percent,variants:product_variant(id,label,is_active)',
      orderBy: 'sortOrder',
      limit,
    });
  }

  /**
   * Ekran başlığındaki sayaçlar — liste sayfalandığı için client artık türetemez. Tek tablo
   * olduğundan okuma-RPC eşiğini karşılamaz (STACK §13) → `head: true` sayım sorguları; satır
   * taşınmaz, indeks taranır. `filters` verilirse sayaçlar da AYNI süzgeçten geçer.
   */
  async counts(filters?: ProductFilters): Promise<{ total: number; candidate: number; incomplete: number }> {
    const base = this.buildQuery(filters);
    const incomplete = this.buildQuery({ ...filters, onlyIncomplete: true });
    const candidate = this.buildQuery({ ...filters, status: 'candidate' });
    const [total, candidateCount, incompleteCount] = await Promise.all([
      this.count(base.filters, { orFilters: base.orFilters }),
      this.count(candidate.filters, { orFilters: candidate.orFilters }),
      this.count(incomplete.filters, { orFilters: incomplete.orFilters }),
    ]);
    return { total, candidate: candidateCount, incomplete: incompleteCount };
  }

  /**
   * Kategori başına ürün sayısı — TEK sorgu, TEK kolon. Kategori başına ayrı sayım atmak N+1 doğurur;
   * bu yüzden tüm ürünlerin yalnız `category_id`'si çekilip burada gruplanır (satır başına bir uuid;
   * ekranın kendisi sayfalı kalır — taşınan yük listenin kendisi değil).
   *
   * Neden SQL toplaması değil: PostgREST'te toplama fonksiyonları (`count()` + örtük group by) bu
   * kurulumda kapalı ("Use of aggregate functions is not allowed" — güvenlik varsayılanı). Hacim
   * büyürse iki seçenek var: Supabase config'inde toplamayı açmak ya da bir okuma görünümü (view).
   */
  async countsByCategory(): Promise<Map<string, number>> {
    const rows = await this.getAllAs(CategoryCountRowSchema, undefined, {
      select: 'categoryId:category_id',
      isNotNullFields: ['categoryId'],
    });
    const counts = new Map<string, number>();
    for (const { categoryId } of rows) counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
    return counts;
  }

  /**
   * Süzgeçleri eq-filtrelerine ve `or` gruplarına çevirir — liste ve sayaçlar AYNI çeviriyi
   * kullanır (yoksa "12 sonuç" yazıp 5 satır gösteren ekran doğar).
   */
  private buildQuery(f?: ProductFilters): { filters: Record<string, unknown>; orFilters: string[] } {
    const filters: Record<string, unknown> = {};
    const orFilters: string[] = [];
    if (f?.categoryId) filters.categoryId = f.categoryId;
    if (f?.ids) filters.id = f.ids; // dizi → IN (base sorgu kurucusu çevirir)
    if (f?.status) filters.status = f.status; // tek kolon → düz eşitlik (eski ikili bayrak çevrimi kalktı)

    const q = f?.query?.trim();
    if (q) {
      // PostgREST filtre dizesine gömülüyor: değeri çift tırnakla sar ve tırnağı ayıkla ki
      // virgül/parantez ayrıştırmayı bozmasın. `*` PostgREST'in ilike joker karakteri.
      const safe = q.replace(/"/g, '').replace(/[(),]/g, ' ');
      orFilters.push(LOCALIZED_TEXT_KEYS.map((l) => `name->>${l}.ilike."*${safe}*"`).join(','));
    }

    if (f?.onlyIncomplete) {
      // Ölçüt `missingDeclarations` ile AYNI olmalı (types/product.schema) — ikisi ayrışırsa ekran
      // "24 beyan eksik" yazıp süzgeçte 12 satır gösterir. Oradaki kural burada SQL'e çevrilir:
      //   · ad dillerinden biri yok        · içindekiler / saklama hiç girilmemiş (jsonb null)
      //   · besin değerleri girilmemiş     · alerjen listesi boş
      // Boş dil DB'ye yazılmaz (form kaydederken boş diller atılır) → eksik dil = anahtarın YOKLUĞU.
      const missingLang = LOCALIZED_TEXT_KEYS.map((l) => `name->>${l}.is.null`);
      orFilters.push(
        [...missingLang, 'ingredients.is.null', 'nutrition.is.null', 'storage_instructions.is.null', 'allergens.eq.{}'].join(','),
      );
    }
    return { filters, orFilters };
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
}
