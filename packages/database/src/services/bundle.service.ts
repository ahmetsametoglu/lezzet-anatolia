import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BundleSchema,
  BundleInsertSchema,
  BundleUpdateSchema,
  BundleWithItemsSchema,
  resolveLocalizedText,
  type Bundle,
  type BundleDetailsUpdate,
  type BundleInsert,
  type BundleItem,
  type BundleItemEntry,
  type BundleUpdate,
  type BundleWithItems,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';
import { BundleItemService } from './bundle-item.service';

/**
 * Paket (bundle) CRUD + kalem orkestrasyonu. Paket, birden çok ürünü TEK fiyata sunan katalog
 * kısayoludur (DOMAIN §13); yeni ürün yaratmaz, sepete eklenince kalemleri ayrı `order_item` olur.
 *
 * ⚠ Bu servis **karar vermez**: "atanmış fiyat toplamı paket fiyatını tutuyor mu" sorusunun cevabı
 * `domain-core`'da (`bundleBalance`) — `database` motoru bilmez (STACK §4). Servis yalnız satır
 * getirir/yazar; toplamı doğrulayıp reddetme kararı uygulama katmanında verilir (server action).
 * Yine de veriyi BOZAN iki şeyi engeller: kalemsiz paket kaydı ve başka pakete ait kalem.
 */
export type CreateBundleInput = Omit<BundleInsert, 'slug'> & { items?: BundleItemEntry[] };

export class BundleService extends BaseDbService<Bundle, BundleInsert, BundleUpdate> {
  private readonly items: BundleItemService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'bundle', BundleSchema, BundleInsertSchema, BundleUpdateSchema);
    this.items = new BundleItemService(supabase);
  }

  /** Kürelenmiş vitrin sırasında tüm paketler (operasyon listesi — aktif/pasif hepsi). */
  async listAll(): Promise<Bundle[]> {
    return this.getAll(undefined, { orderBy: 'sortOrder' });
  }

  /**
   * Paketler + kalemleri TEK sorguda. Kalem başına ayrı sorgu atılırsa liste N+1 doğurur; operasyon
   * listesi "N kalem" ve mutabakat rozetini kalemlerden hesapladığı için onlara her satırda ihtiyaç var.
   */
  async listWithItems(): Promise<BundleWithItems[]> {
    return this.getAllAs(BundleWithItemsSchema, undefined, {
      select: '*,items:bundle_item(*)',
      orderBy: 'sortOrder',
    });
  }

  /** Tek paket + kalemleri (form ön-dolgusu, müşteri detay sayfası). */
  async getWithItems(id: string): Promise<BundleWithItems | null> {
    const rows = await this.getAllAs(BundleWithItemsSchema, { id }, { select: '*,items:bundle_item(*)' });
    return rows[0] ?? null;
  }

  /**
   * Vitrin: satılabilir paketler, kürelenmiş sırada. Stok türevi uygulama katmanında.
   *
   * SATILABİLİRLİK TÜRETİLİR, saklanmaz: paket ancak kendisi satıştaysa VE tüm kalemlerinin ürünü/boyu
   * satıştaysa vitrine çıkar (DOMAIN §13). Ürün pasife alındığında `bundle.is_active`'i çevirmiyoruz —
   * o alan operatörün NİYETİ; üstüne yazsaydık ürün geri açıldığında paket pasif kalır ve geri
   * açılması gerektiğini kimse bilemezdi. Niyet korunur, gerçek hesaplanır.
   *
   * İki sorgu, N+1 yok: paketler kalemleriyle, kalemlerin varyant/ürün durumu tek turda.
   */
  async listSellable(): Promise<BundleWithItems[]> {
    const rows = await this.getAllAs(BundleWithItemsSchema, { isActive: true }, {
      select: '*,items:bundle_item(*)',
      orderBy: 'sortOrder',
    });
    const variantIds = [...new Set(rows.flatMap((b) => b.items.map((i) => i.variantId)))];
    if (variantIds.length === 0) return rows.filter((b) => b.items.length > 0);

    // Ham sorgu, gerekçesi belli: durum bilgisi İKİ tablodan geliyor (varyant + ürün) ve `bundle`
    // üzerinden gömülü okunamıyor — `bundle_item` ile `product_variant` arasındaki ilişki paketin
    // kendi seçiminde değil. Alternatif, kalem başına sorgu atmaktı (N+1).
    const { data, error } = await this.supabase
      .from('product_variant')
      .select('id,is_active,product:product(status)')
      .in('id', variantIds);
    if (error) throw error;

    const sellableVariants = new Set(
      (data ?? [])
        .filter((row) => {
          const variant = row as { is_active: boolean; product: { status: string } | { status: string }[] | null };
          const product = Array.isArray(variant.product) ? variant.product[0] : variant.product;
          return variant.is_active && product?.status === 'active';
        })
        .map((row) => (row as { id: string }).id),
    );

    // Kalemsiz paket de düşer: müşteriye "paket" diye boş bir kart göstermek satın alınamayan bir
    // vaat olurdu.
    return rows.filter((b) => b.items.length > 0 && b.items.every((i) => sellableVariants.has(i.variantId)));
  }

  async findBySlug(slug: string): Promise<Bundle | null> {
    return this.getOneBy({ slug });
  }

  /** Yeni paket: slug addan türer, sıra listenin sonuna. Kalemler verilirse birlikte yazılır. */
  async create(input: CreateBundleInput): Promise<{ bundle: Bundle; items: BundleItem[] }> {
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, resolveLocalizedText(input.name));
    const sortOrder = input.sortOrder ?? (await this.count());
    const { items: entries, ...fields } = input;
    const bundle = await this.insert({ ...fields, slug, sortOrder });
    const items = entries && entries.length > 0 ? await this.items.syncItems(bundle.id, entries) : [];
    return { bundle, items };
  }

  /** Düzenlenebilir alanlar + kalemler. Slug SABİT kalır (paylaşılan link korunur). */
  async updateDetails(id: string, input: BundleDetailsUpdate): Promise<Bundle> {
    return this.update({ id, ...input } as BundleUpdate);
  }

  async setActive(id: string, isActive: boolean): Promise<Bundle> {
    return this.update({ id, isActive });
  }

  /** Görsel anahtarı + sürüm damgası (R2 yüklemesinden sonra). */
  async setImageKey(id: string, imageKey: string): Promise<Bundle> {
    return this.writeImageKey(id, imageKey);
  }

  /** Kürasyon sırası (sürükle-bırak) — müşterinin gördüğü paket sırası. */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }

  /** Kalem senkronu — kalem servisine devreder (tek yerde). */
  async syncItems(bundleId: string, entries: BundleItemEntry[]): Promise<BundleItem[]> {
    return this.items.syncItems(bundleId, entries);
  }

  /** Bir paketin kalemleri, sıralı. */
  async listItems(bundleId: string): Promise<BundleItem[]> {
    return this.items.listByBundle(bundleId);
  }
}
