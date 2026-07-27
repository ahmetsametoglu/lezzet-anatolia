import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ProductSchema,
  ProductInsertSchema,
  ProductUpdateSchema,
  ProductWithRelationsSchema,
  resolveLocalizedText,
  statusToFlags,
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
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';
import { ProductVariantService } from './product-variant.service';

// Ürün listesi süzgeçleri — operasyon ekranının URL parametreleriyle birebir (tek kaynak). Şimdilik
// iç sözleşme: çağıranlar nesne literaliyle geçiyor (tip çıkarımı yeter). Ekran URL'den süzgeç kurmaya
// başlayınca dışa verilir — tipler artımlı büyür (CLAUDE.md §1).
interface ProductFilters {
  /** Ad araması; üç dilde birden aranır. */
  query?: string;
  categoryId?: string;
  status?: ProductStatus;
  /** Yalnız beyanı eksik olanlar (ad dili eksik veya alerjen boş). */
  onlyIncomplete?: boolean;
}

interface ProductListOptions {
  filters?: ProductFilters;
  cursor?: KeysetCursor;
  limit?: number;
}

// Varyantsız üründe otomatik açılan tek varyantın etiketi (müşteriye gösterilmez — seçici gizli).
const DEFAULT_VARIANT_LABEL = 'default';

// Yeni varyant girişi — insert şemasından türer (productId create içinde bağlanır). No-duplication.
export type CreateVariantInput = Omit<ProductVariantInsert, 'productId'>;

// Yeni ürün girişi — insert şemasından türer (slug servis türetir) + varyantlar. No-duplication.
export type CreateProductInput = Omit<ProductInsert, 'slug'> & { variants?: CreateVariantInput[] };

/**
 * Ürün CRUD + varyant orkestrasyonu + koleksiyon bağı. Satılabilir birim her zaman varyant
 * olduğundan varyantsız üründe otomatik varsayılan varyant açılır. Aday ürün (is_candidate)
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
   *  · `status`     → is_candidate/is_active ikilisi (`statusToFlags`, tek kaynak)
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
   * Süzgeçleri eq-filtrelerine ve `or` gruplarına çevirir — liste ve sayaçlar AYNI çeviriyi
   * kullanır (yoksa "12 sonuç" yazıp 5 satır gösteren ekran doğar).
   */
  private buildQuery(f?: ProductFilters): { filters: Record<string, unknown>; orFilters: string[] } {
    const filters: Record<string, unknown> = {};
    const orFilters: string[] = [];
    if (f?.categoryId) filters.categoryId = f.categoryId;
    if (f?.status) Object.assign(filters, statusToFlags(f.status));

    const q = f?.query?.trim();
    if (q) {
      // PostgREST filtre dizesine gömülüyor: değeri çift tırnakla sar ve tırnağı ayıkla ki
      // virgül/parantez ayrıştırmayı bozmasın. `*` PostgREST'in ilike joker karakteri.
      const safe = q.replace(/"/g, '').replace(/[(),]/g, ' ');
      orFilters.push(LOCALIZED_TEXT_KEYS.map((l) => `name->>${l}.ilike."*${safe}*"`).join(','));
    }

    if (f?.onlyIncomplete) {
      // Boş dil DB'ye yazılmaz (form kaydederken boş diller atılır) → eksik dil = anahtarın YOKLUĞU.
      const missingLang = LOCALIZED_TEXT_KEYS.map((l) => `name->>${l}.is.null`).join(',');
      orFilters.push(`${missingLang},allergens.eq.{}`);
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

  /** Satılabilir katalog: aktif + aday DEĞİL (aday yalnız keşifte). */
  async listSellable(): Promise<Product[]> {
    return this.getAll({ isActive: true, isCandidate: false }, { orderBy: 'sortOrder' });
  }

  /** Aday ürünler (keşif/tinder bölümü). */
  async listCandidates(): Promise<Product[]> {
    return this.getAll({ isCandidate: true }, { orderBy: 'sortOrder' });
  }

  /**
   * Ürün + varyantlarını oluşturur. `variants` verilmezse varsayılan tek varyant açılır
   * (fiyat/stok mantığı her yerde varyant üzerinden çalışsın diye).
   */
  async create(input: CreateProductInput): Promise<{ product: Product; variants: ProductVariant[] }> {
    const { variants, ...productFields } = input;
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    const product = await this.insert({ ...productFields, slug });

    const variantSvc = new ProductVariantService(this.supabase);
    const toCreate: CreateVariantInput[] = variants && variants.length > 0 ? variants : [{ label: DEFAULT_VARIANT_LABEL }];
    const created: ProductVariant[] = [];
    for (const [i, v] of toCreate.entries()) {
      created.push(await variantSvc.insert({ ...v, productId: product.id, sortOrder: v.sortOrder ?? i }));
    }
    return { product, variants: created };
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<Product> {
    return this.update({ id, isActive });
  }

  /** Görsel anahtarını yazar (R2 yüklemesinden sonra). Relative key; prefix R2 çağrısında eklenir. */
  async setImageKey(id: string, imageKey: string): Promise<Product> {
    return this.update({ id, imageKey });
  }

  /**
   * Ürün alanlarını günceller (yalnız verilenler). Slug rename'de sabit kalır. Görsel ve varyant
   * düzenleme ayrı akışlarda — bu, düzenleme formunun "Temel + içerik + beyan" alanlarını yazar.
   */
  async updateDetails(id: string, input: ProductDetailsUpdate): Promise<Product> {
    return this.update({ id, ...input });
  }
}
