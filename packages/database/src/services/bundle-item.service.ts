import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BundleItemSchema,
  BundleItemInsertSchema,
  BundleItemUpdateSchema,
  type BundleItem,
  type BundleItemEntry,
  type BundleItemInsert,
  type BundleItemUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Paket kalemi — junction tablosu, kendi alt sınıfı (STACK §6). `allocated_unit_price` müşteriye
 * görünmez: faturada her kalemin KDV'si kendi ürününün oranından işlensin diye tutulur.
 */
export class BundleItemService extends BaseDbService<BundleItem, BundleItemInsert, BundleItemUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'bundle_item', BundleItemSchema, BundleItemInsertSchema, BundleItemUpdateSchema);
  }

  /** Bir paketin kalemleri, müşteriye gösterilecek sırada. */
  async listByBundle(bundleId: string): Promise<BundleItem[]> {
    return this.getAll({ bundleId }, { orderBy: 'sortOrder' });
  }

  /**
   * Formdan gelen kalem listesini pakete senkronlar (varyant editörünün deseni): `id`'li satır
   * güncellenir, id'siz eklenir, mevcutta olup listede olmayan silinir. `sortOrder` liste sırasından
   * yazılır — o sıra müşterinin paket içeriğinde gördüğü sıradır.
   *
   * BOŞ liste kalemleri SİLER (ürün varyantının tersine): varyantsız ürün olamaz ama kalemsiz paket
   * geçici olarak olabilir — operatör hepsini çıkarıp yeniden kurabilir. Kalemsiz paketin satılamaz
   * olduğu kararı uygulama katmanında (mutabakat: 0 ≠ paket fiyatı → kayıt reddedilir).
   *
   * Aynı varyant iki kez gelirse DB reddeder (`unique(bundle_id, variant_id)`) — "iki tane" demek
   * adet artırmaktır. Hata mesajı okunabilir hâle çevrilir, ham kısıt adı ekrana düşmez.
   */
  async syncItems(bundleId: string, entries: BundleItemEntry[]): Promise<BundleItem[]> {
    const existing = await this.listByBundle(bundleId);
    const keepIds = new Set(entries.filter((e) => e.id).map((e) => e.id));
    for (const ex of existing) {
      if (!keepIds.has(ex.id)) await this.delete(ex.id);
    }

    const result: BundleItem[] = [];
    for (const [i, e] of entries.entries()) {
      const fields = { variantId: e.variantId, qty: e.qty, allocatedUnitPrice: e.allocatedUnitPrice, sortOrder: i };
      try {
        result.push(e.id ? await this.update({ id: e.id, ...fields }) : await this.insert({ bundleId, ...fields }));
      } catch (err) {
        const raw = err instanceof Error ? err.message : String((err as { message?: unknown } | null)?.message ?? err);
        if (/duplicate key|unique/i.test(raw)) {
          throw new Error('Aynı ürün ve boy pakete iki kez eklenemez — adedi artırın.');
        }
        throw err;
      }
    }
    return result;
  }

  /** Sürükle-bırak sırası. */
  async reorder(orderedIds: string[]): Promise<void> {
    return this.reorderBy(orderedIds, 'sortOrder');
  }
}
