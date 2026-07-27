import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CollectionSchema,
  CollectionInsertSchema,
  CollectionUpdateSchema,
  resolveLocalizedText,
  type Collection,
  type CollectionInsert,
  type CollectionUpdate,
  type ImageCropFields,
  type LocalizedText,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { uniqueSlugForTable } from '../utils/slug';
import { ProductCollectionService } from './product-collection.service';

// Yeni koleksiyon girişi. `slug` VERİLİRSE o kullanılır (paylaşım linkini admin belirler), verilmezse
// addan türetilir; ikisinde de tablo genelinde benzersizleştirilir. `productIds` verilirse koleksiyon
// İÇERİĞİYLE birlikte doğar (koleksiyon = ürün listesi; boş doğup sonra doldurmak zorunlu değil).
export interface CreateCollectionInput {
  name: LocalizedText;
  description?: LocalizedText | null;
  slug?: string;
  sortOrder?: number;
  isActive?: boolean;
  productIds?: string[];
}

// Düzenlenebilir alanlar — slug YOK (paylaşılmış link kırılmasın; DOMAIN §13). Kapak (OG kartı) odak/
// zoom künyesi ortak ImageCropFields'ten gelir; dosyanın kendisi ayrı yükleme akışında (setImageKey).
interface EditCollectionInput extends Partial<ImageCropFields> {
  name?: LocalizedText;
  description?: LocalizedText | null;
  isActive?: boolean;
}

/**
 * Koleksiyon CRUD — kategoriyle aynı düz/sıralı desen. Ürün↔koleksiyon çoklu bağı
 * (product_collections) Product ile birlikte task 3'te eklenir.
 */
export class CollectionService extends BaseDbService<Collection, CollectionInsert, CollectionUpdate> {
  private readonly links: ProductCollectionService;

  constructor(supabase: SupabaseClient) {
    super(supabase, 'collection', CollectionSchema, CollectionInsertSchema, CollectionUpdateSchema);
    this.links = new ProductCollectionService(supabase);
  }

  /** Sıralı liste; `activeOnly` ile yalnız aktifler. */
  async list(opts?: { activeOnly?: boolean }): Promise<Collection[]> {
    return this.getAll(opts?.activeOnly ? { isActive: true } : undefined, { orderBy: 'sortOrder' });
  }

  /**
   * Yeni koleksiyon. slug: verilen (admin'in paylaşım linki) ya da addan türetilen — her hâlde tablo
   * genelinde benzersizleştirilir. `productIds` verilirse üyelik de (verilen sırayla) kurulur.
   */
  async create(input: CreateCollectionInput): Promise<Collection> {
    const slug = await uniqueSlugForTable(this.supabase, this.tableName, input.slug?.trim() || resolveLocalizedText(input.name));
    // sortOrder verilmezse listenin SONUNA eklenir (DB default'u 0 olduğundan aksi hâlde yeni kayıt
    // mevcutların arasına karışır — sıralama sortOrder'a göre ve eşitlikte sıra belirsiz).
    const sortOrder = input.sortOrder ?? (await this.count());
    const created = await this.insert({
      name: input.name,
      description: input.description,
      slug,
      sortOrder,
      isActive: input.isActive,
    });
    if (input.productIds?.length) await this.links.setProductsIn(created.id, input.productIds);
    return created;
  }

  /** Aktif/pasif (soft). */
  async setActive(id: string, isActive: boolean): Promise<Collection> {
    return this.update({ id, isActive });
  }

  /** Ad/açıklama/aktiflik günceller; slug SABİT kalır (paylaşılmış link korunur). */
  async edit(id: string, input: EditCollectionInput): Promise<Collection> {
    return this.update({ id, ...input });
  }

  /** Kapak görseli anahtarı (R2'ye yükleme sonrası). */
  async setImageKey(id: string, imageKey: string): Promise<Collection> {
    return this.update({ id, imageKey });
  }

  /** Sürükle-bırak sırası: verilen id dizisine göre sortOrder'ı 0..n-1 yazar. */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }

  // ── Üyelik (koleksiyon = ürün listesi, DOMAIN §13). product_collections junction servisine devreder. ──

  /** Koleksiyona ürün ekler (idempotent) — listenin SONUNA. */
  async addProduct(collectionId: string, productId: string): Promise<void> {
    const current = await this.links.productIdsIn(collectionId);
    if (current.includes(productId)) return;
    await this.links.link(collectionId, productId, current.length);
  }

  /** Koleksiyondan ürün çıkarır. */
  async removeProduct(collectionId: string, productId: string): Promise<void> {
    await this.links.unlink(collectionId, productId);
  }

  /** Koleksiyondaki ürün id'leri — vitrin sırasında. */
  async productIds(collectionId: string): Promise<string[]> {
    return this.links.productIdsIn(collectionId);
  }

  /** Üyeliği verilen listeye eşitler; dizinin SIRASI vitrin sırasıdır (kürasyon). */
  async setProducts(collectionId: string, productIds: string[]): Promise<void> {
    await this.links.setProductsIn(collectionId, productIds);
  }
}
