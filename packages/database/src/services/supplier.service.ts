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
import { toCents } from '@lezzet/helper';
import { BaseDbService } from '../core/base.service';

/**
 * Tedarikçi kartı (06.8) — müşteri kartının simetriği (DOMAIN §16).
 *
 * **Borç saklanmaz, türetilir:** Σ stok girişleri − Σ tedarikçiye ödemeler (`debt()`, 12.3).
 * İki yarım da hesaplanıyor; dönem daraltması ve cent dönüşümü orada.
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
   * ⚠ **Dönem `balanceCents`'i bir borç DEĞİLDİR** ve okuyan taraf bunu bilmeli: aralık verildiğinde
   * `paidCents` da kırpılır, yani "bu yıl alınan mal − bu yıl yapılan ödeme" çıkar. Geçen yılın malına
   * bu yıl yapılan ödeme o farkı negatife çeker. Dönemli çağrının anlamlı alanı `intakeTotalCents`'tir
   * ("bu tedarikçiyle bu yıl ne kadar iş yaptık"); borç sorusu dönemsizdir.
   *
   * **Dönüş cent** (02.9 · `STACK §8`). İki toplam iki AYRI ailenin kolonundan geliyor (`stock_intake`
   * tedarik, `money_movement` para) ve ikisi de ham okunuyor — biri cent'e inip öteki euro kalsaydı
   * aynı nesnede iki birim yan yana dururdu ve `balance` çıkarması sessizce 100× şaşardı.
   */
  async debt(
    supplierId: string,
    period: { from?: Date; to?: Date } = {},
  ): Promise<{ intakeTotalCents: number; paidCents: number; balanceCents: number }> {
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

    // Toplama SATIR SATIR cent'e inilerek yapılır, euro'da toplanıp sonra çevrilerek değil: kayan
    // noktada biriken artık, çevrimden önce toplandığında bir kuruş kaydırabilir. Cent tamsayı
    // olduğu için toplamın kendisi kesindir — eski kodun `Math.round(v * 100) / 100` düzeltmesi
    // artık gereksiz, çünkü düzeltilecek bir artık kalmıyor.
    const sumCents = (rows: unknown[], field: string) =>
      rows.reduce<number>((sum, row) => sum + toCents(Number((row as Record<string, string | number>)[field])), 0);

    const intakeTotalCents = sumCents(intakes.data ?? [], 'total_amount');
    const paidCents = sumCents(payments.data ?? [], 'amount');
    return { intakeTotalCents, paidCents, balanceCents: intakeTotalCents - paidCents };
  }
}

/**
 * Ürün–tedarikçi eşlemesi (06.8). Tedarik siparişi **tedarikçinin diliyle** yazılabilsin diye:
 * bizim varyantımız ↔ onların kodu. Bir varyantın birden çok tedarikçisi olabilir (alternatif kaynak);
 * biri "tercihli" işaretlenir.
 */
export class SupplierProductService extends BaseDbService<SupplierProduct, SupplierProductInsert, SupplierProductUpdate> {
  /** Kolon `supplier_product.last_purchase_price` (euro numeric); app tarafı cent (STACK §8). */
  protected override readonly moneyFields = ['lastPurchasePriceCents'];

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

  /**
   * Tedarikçi koduyla tek eşleme — tarama zincirinin ÜÇÜNCÜ halkası
   * (`VariantBarcodeService.findByCode`). Kod tedarikçi başına benzersizdir, küresel değil;
   * çakışmada ilk satır döner. Zinciri burada kurma — tek kapı orada.
   */
  async findBySupplierCode(supplierCode: string): Promise<SupplierProduct | null> {
    return this.getOneBy({ supplierCode });
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
    return this.setExclusiveFlag(id, 'isPreferred', 'variantId');
  }
}
