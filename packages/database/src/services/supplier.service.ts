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
   * Tedarikçiye borç — **türetilir, saklanmaz**: Σ girişler − Σ ödemeler (12.3).
   *
   * `paid`, o tedarikçiye ÇIKAN paranın toplamıdır — tipine bakılmaz. Ölçüt hareketin `supplier_id`
   * bağıdır: mal bedeli (`purchase`) da, sonradan yapılan bir düzeltme ödemesi de aynı borcu kapatır.
   * Tipe göre süzseydik, doğru bağlanmış ama farklı tipteki bir ödeme borçta görünmezdi.
   *
   * İki tur okur: girişler ve ödemeler ayrı tablolarda. Tedarikçi başına çağrılır (kart ekranı),
   * liste ekranı gerekirse toplu okuma ayrıca eklenir.
   *
   * **Dönem isteğe bağlı** (tedarik talebi §6): aralık verilmezse ömür boyu — bugünkü davranış, hiçbir
   * çağıran kırılmaz. Aralık ikinci bir toplayıcı olarak DEĞİL bu metoda eklendi: borç da dönem
   * toplamı da aynı hareketlerden türüyor, ayrı bir okuma aynı kararı iki yere koymak olurdu.
   *
   * ⚠ **Dönem `balance`'ı bir borç DEĞİLDİR** ve okuyan taraf bunu bilmeli: aralık verildiğinde
   * `paid` da kırpılır, yani "bu yıl alınan mal − bu yıl yapılan ödeme" çıkar. Geçen yılın malına bu
   * yıl yapılan ödeme o farkı negatife çeker. Dönemli çağrının anlamlı alanı `intakeTotal`'dir
   * ("bu tedarikçiyle bu yıl ne kadar iş yaptık"); borç sorusu dönemsizdir.
   */
  async debt(
    supplierId: string,
    period: { from?: Date; to?: Date } = {},
  ): Promise<{ intakeTotal: number; paid: number; balance: number }> {
    const inPeriod = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(query: T): T => {
      let scoped = query;
      if (period.from) scoped = scoped.gte('created_at', period.from.toISOString());
      if (period.to) scoped = scoped.lte('created_at', period.to.toISOString());
      return scoped;
    };

    const [intakes, payments] = await Promise.all([
      inPeriod(this.supabase.from('stock_intake').select('total_amount').eq('supplier_id', supplierId)),
      inPeriod(this.supabase.from('money_movement').select('amount').eq('supplier_id', supplierId).eq('direction', 'out')),
    ]);
    if (intakes.error) throw intakes.error;
    if (payments.error) throw payments.error;

    const sumOf = (rows: unknown[], field: string) =>
      rows.reduce<number>((sum, row) => sum + Number((row as Record<string, string | number>)[field]), 0);

    // Para 2 ondalıktır; kayan nokta artığı borç rakamında görünmesin.
    const round = (v: number) => Math.round(v * 100) / 100;
    const intakeTotal = round(sumOf(intakes.data ?? [], 'total_amount'));
    const paid = round(sumOf(payments.data ?? [], 'amount'));
    return { intakeTotal, paid, balance: round(intakeTotal - paid) };
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
