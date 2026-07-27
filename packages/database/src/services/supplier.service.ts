import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupplierSchema,
  SupplierInsertSchema,
  SupplierUpdateSchema,
  SupplierProductSchema,
  SupplierProductInsertSchema,
  SupplierProductUpdateSchema,
  type Supplier,
  type SupplierInsert,
  type SupplierUpdate,
  type SupplierProduct,
  type SupplierProductInsert,
  type SupplierProductUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Tedarikçi kartı (06.8) — müşteri kartının simetriği (DOMAIN §16).
 *
 * **Borç saklanmaz, türetilir:** Σ stok girişleri − Σ tedarikçiye ödemeler. Ödeme tarafı
 * `MoneyMovement` (modül 12) geldiğinde `debt()` o toplamı da düşecek; şimdilik giriş toplamı
 * döner ve eksik yarısı açıkça işaretlidir.
 */
export class SupplierService extends BaseDbService<Supplier, SupplierInsert, SupplierUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'supplier', SupplierSchema, SupplierInsertSchema, SupplierUpdateSchema);
  }

  async list(opts: { activeOnly?: boolean } = {}): Promise<Supplier[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }

  /**
   * Tedarikçiye borç — **türetilir**: Σ girişler − Σ ödemeler.
   * `paid` şu an 0: para hareketleri modül 12'de açılıyor. Alan yapısı bugünden doğru ki tüketiciler
   * (admin kartı, muhasebe özeti) sonradan değişmesin.
   */
  async debt(supplierId: string): Promise<{ intakeTotal: number; paid: number; balance: number }> {
    const { data, error } = await this.supabase
      .from('stock_intake')
      .select('total_amount')
      .eq('supplier_id', supplierId);
    if (error) throw error;

    const intakeTotal = (data ?? []).reduce((sum, row) => sum + Number((row as { total_amount: string | number }).total_amount), 0);
    const paid = 0; // TODO(modül 12): Σ MoneyMovement(out, supplier_id)
    return { intakeTotal, paid, balance: intakeTotal - paid };
  }
}

/**
 * Ürün–tedarikçi eşlemesi (06.8). Tedarik siparişi **tedarikçinin diliyle** yazılabilsin diye:
 * bizim varyantımız ↔ onların kodu. Bir varyantın birden çok tedarikçisi olabilir (alternatif kaynak);
 * biri "tercihli" işaretlenir.
 */
export class SupplierProductService extends BaseDbService<SupplierProduct, SupplierProductInsert, SupplierProductUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'supplier_product', SupplierProductSchema, SupplierProductInsertSchema, SupplierProductUpdateSchema);
  }

  /** Tedarikçinin kataloğu. */
  async listBySupplier(supplierId: string): Promise<SupplierProduct[]> {
    return this.getAll({ supplierId }, { orderBy: 'supplierCode' });
  }

  /** Bir varyantın kaynakları — tercihli önce ("kimden alıyorum" listesi). */
  async listByVariant(variantId: string): Promise<SupplierProduct[]> {
    return this.getAll({ variantId }, { orderBy: 'isPreferred', orderDirection: 'desc' });
  }

  /** Varyantların eşlemelerini TEK sorguda — PO taslağı üretirken satır başına sorgu atılmasın. */
  async listByVariants(variantIds: string[]): Promise<SupplierProduct[]> {
    return this.getAll({ variantId: variantIds });
  }

  /**
   * Eşleme yazar/günceller. Aynı (tedarikçi, varyant) ikilisi iki kez tanımlanmaz — kod değişirse
   * satır güncellenir, kopya satır doğmaz.
   */
  async setMapping(input: SupplierProductInsert): Promise<SupplierProduct> {
    return this.upsert(input, 'supplier_id,variant_id');
  }

  /**
   * Tercihli tedarikçiyi değiştirir: aynı varyantın diğer eşlemeleri düşürülür. "İki tercihli"
   * durumu sessiz bir belirsizliktir — öneri hangisini seçeceğini bilemez.
   */
  async setPreferred(id: string): Promise<SupplierProduct> {
    const mapping = await this.getById(id);
    if (!mapping) throw new Error(`supplier_product bulunamadı: ${id}`);

    const { error } = await this.supabase
      .from('supplier_product')
      .update({ is_preferred: false })
      .eq('variant_id', mapping.variantId);
    if (error) throw error;

    return this.update({ id, isPreferred: true });
  }
}
