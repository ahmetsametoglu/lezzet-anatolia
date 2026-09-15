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
 * **Borç saklanmaz, türetilir:** Σ alım − Σ ödeme (`debt()`, 12.3); alım 12.26'dan beri BELGEDEN —
 * tedarikçinin faturaları + faturası henüz girilmemiş kabuller. Dönem daraltması ve cent dönüşümü orada.
 */
export class SupplierService extends BaseDbService<Supplier, SupplierInsert, SupplierUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'supplier', SupplierSchema, SupplierInsertSchema, SupplierUpdateSchema);
  }

  async list(opts: { activeOnly?: boolean } = {}): Promise<Supplier[]> {
    return this.getAll(opts.activeOnly ? { isActive: true } : undefined, { orderBy: 'name' });
  }

  /**
   * Tedarikçiye borç — **türetilir, saklanmaz**: Σ alım − Σ ödeme (12.3 · 12.26).
   *
   * ── ALIM BELGEDEN TÜRER (12.26 · kullanıcı kararı 14.09) ────────────────────
   * Alım = tedarikçinin BELGELERİ (fatura artı, tedarikçinin alacak dekontu eksi) + faturası henüz
   * girilmemiş mal kabullerin satır toplamı. Bir tur yalnız kabullerin toplamıydı ve ölçüldü: kabulün
   * toplamı birim maliyet × adettir — KDV hariç, nakliyeyi ve iskontoyu bilmez — oysa ödenen şey
   * faturanın toplamıdır; sahadan maliyetsiz yapılan kabulde borç hiç doğmuyordu. Faturası girilen
   * (belgeye ya da siparişine bağlanan) kabul `stock_intake_balance.has_document` taşır ve burada
   * ikinci kez sayılmaz.
   *
   * `paid` = o tedarikçiye ÇIKAN para eksi ondan GİREN para (iade) — tipine bakılmaz. Ölçüt hareketin
   * `supplier_id` bağıdır: mal bedeli (`purchase`) da, sonradan yapılan bir düzeltme ödemesi de aynı
   * borcu kapatır. Faturanın ödemesi "Ödemesini yaz" ile de yazılsa, banka satırından da bağlansa
   * hareket tedarikçiyi taşır (12.26). Giren parayı düşmemek, alacak dekontunu alımdan düşüp iadesini
   * ödemeden düşmemek olurdu — borç iade tutarı kadar eksiye kayardı.
   *
   * Üç tur okur (belge · belgesiz kabul · hareket). Tedarikçi başına çağrılır (kart ekranı), liste
   * ekranı gerekirse toplu okuma ayrıca eklenir.
   *
   * **Dönem isteğe bağlı** (tedarik talebi §6): aralık verilmezse ömür boyu. Dönem İŞİN GÜNÜNE göre
   * süzülür — belgenin günü (`issued_on`), kabulün günü (`date`), paranın günü (`value_date`); kaydın
   * yazıldığı an değil: dün akşam fotoğraflanan fatura bugün girilir ama dünün alımıdır.
   *
   * ⚠ **Dönem `balanceCents`'i bir borç DEĞİLDİR** ve okuyan taraf bunu bilmeli: aralık verildiğinde
   * `paidCents` da kırpılır, yani "bu yıl alınan mal − bu yıl yapılan ödeme" çıkar. Geçen yılın malına
   * bu yıl yapılan ödeme o farkı negatife çeker. Dönemli çağrının anlamlı alanı `purchasedCents`'tir
   * ("bu tedarikçiyle bu yıl ne kadar iş yaptık"); borç sorusu dönemsizdir.
   *
   * **Dönüş cent** (02.9 · `STACK §8`). Toplamlar üç AYRI ailenin kolonundan geliyor ve hepsi ham
   * okunuyor — biri cent'e inip öteki euro kalsaydı `balance` çıkarması sessizce 100× şaşardı.
   */
  async debt(
    supplierId: string,
    period: { from?: Date; to?: Date } = {},
  ): Promise<{ purchasedCents: number; paidCents: number; balanceCents: number }> {
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const inPeriod = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(query: T, column: string): T => {
      let scoped = query;
      if (period.from) scoped = scoped.gte(column, day(period.from));
      if (period.to) scoped = scoped.lte(column, day(period.to));
      return scoped;
    };

    const [documents, intakes, movements] = await Promise.all([
      inPeriod(this.supabase.from('money_document').select('amount, direction').eq('supplier_id', supplierId), 'issued_on'),
      inPeriod(
        this.supabase.from('stock_intake_balance').select('amount').eq('supplier_id', supplierId).eq('has_document', false),
        'date',
      ),
      inPeriod(this.supabase.from('money_movement').select('amount, direction').eq('supplier_id', supplierId), 'value_date'),
    ]);
    if (documents.error) throw documents.error;
    if (intakes.error) throw intakes.error;
    if (movements.error) throw movements.error;

    // Toplama SATIR SATIR cent'e inilerek yapılır, euro'da toplanıp sonra çevrilerek değil: kayan
    // noktada biriken artık, çevrimden önce toplandığında bir kuruş kaydırabilir. Cent tamsayı
    // olduğu için toplamın kendisi kesindir.
    type Row = Record<string, string | number | null>;
    const centsOf = (row: unknown, field: string) => toCents(Number((row as Row)[field]));
    const signedCents = (rows: unknown[], field: string) =>
      rows.reduce<number>((sum, row) => sum + ((row as Row).direction === 'in' ? -1 : 1) * centsOf(row, field), 0);
    const sumCents = (rows: unknown[], field: string) => rows.reduce<number>((sum, row) => sum + centsOf(row, field), 0);

    const purchasedCents = signedCents(documents.data ?? [], 'amount') + sumCents(intakes.data ?? [], 'amount');
    const paidCents = signedCents(movements.data ?? [], 'amount');
    return { purchasedCents, paidCents, balanceCents: purchasedCents - paidCents };
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
   * Eşlemeleri KİMLİKLE — mal kabul formunun tedarikçi kodu okuması (30.08).
   *
   * `listByVariants` bu iş için YANLIŞ anahtardır ve yanlışlığı sessiz olurdu: aynı varyantın
   * birden çok tedarikçisi olabilir (`supplier_product_key` (tedarikçi, varyant) ikilisinde
   * tekil, varyantta değil) ve varyanttan çözülen kod, siparişin verildiği firmanın değil
   * bir başkasının kodu çıkabilirdi. Sipariş kalemi zaten doğru eşlemeyi işaret ediyor
   * (`purchase_order_item.supplier_product_id`) — okuma o kimliği izler.
   */
  async listByIds(ids: readonly string[]): Promise<SupplierProduct[]> {
    if (ids.length === 0) return [];
    return this.getAll({ id: [...ids] });
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
