import type { SupabaseClient } from '@supabase/supabase-js';
import {
  VariantBarcodeInsertSchema,
  VariantBarcodeSchema,
  VariantBarcodeUpdateSchema,
  type BarcodeKind,
  type VariantBarcode,
  type VariantBarcodeInsert,
  type VariantBarcodeUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { ProductVariantService } from './product-variant.service';
import { SupplierProductService } from './supplier.service';

/**
 * Okutulan kodun EŞLEŞTİĞİ kayıt (`findByCode`) — hangi yoldan bulunduğu cevapla birlikte döner:
 * SKU'dan bulunan eşleşme barkod eşleşmesi kadar kesin değildir ve ekran bunu söyleyebilmeli.
 */
export interface CodeMatch {
  variantId: string;
  kind: BarcodeKind;
  /** Bu kod okutulunca kaç adet sayılır — yalnız gerçek koli barkodu 1'den büyük taşır. */
  qtyPerCode: number;
  source: 'barcode' | 'sku' | 'supplier_code';
}

/**
 * Ürün barkodu ↔ varyant eşlemesi (`variant_barcode`, Modül 23 · `0047_barcode.sql`).
 *
 * Servis SAF I/O'dur: kod bir KİMLİK bulur, stok/depo kararı vermez — o karar mevcut motorlarda
 * kalır (CLAUDE §1 depo değişmezi). Öğrenen eşlemenin kuralları (`already_bound` reddi, kimin
 * öğrettiği) uygulama katmanında (`application/warehouse/scan.ts`); buradaki tek kural veride
 * duran benzersizliktir (`variant_barcode_code_uq`).
 */
export class VariantBarcodeService extends BaseDbService<VariantBarcode, VariantBarcodeInsert, VariantBarcodeUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'variant_barcode', VariantBarcodeSchema, VariantBarcodeInsertSchema, VariantBarcodeUpdateSchema);
  }

  /** Kodun kendi satırı — öğrenme çakışması ("bu kod zaten kimde?") bu okumayla cevaplanır. */
  async getByCode(code: string): Promise<VariantBarcode | null> {
    return this.getOneBy({ code });
  }

  /** Bir varyantın kodları — web varyant editörünün listesi (unit önce: okunan sıra). */
  async listByVariant(variantId: string): Promise<VariantBarcode[]> {
    return this.getAll({ variantId }, { orderBy: 'kind' });
  }

  /** Birden çok varyantın kodları TEK sorguda — ürün formu bütün boyları birden açar. */
  async listByVariants(variantIds: string[]): Promise<VariantBarcode[]> {
    if (variantIds.length === 0) return [];
    return this.getAll({ variantId: variantIds }, { orderBy: 'createdAt' });
  }

  /**
   * **TEK ARAMA KAPISI** (etüt §4 — ekranlar başka yol kurmaz): `barkod → sku → supplier_code`
   * öncelik sırasıyla. Zincirin burada durmasının sebebi tam da bu teklik: mal kabul, toplama,
   * transfer ve tezgâh aynı metodu çağırır; her ekran kendi zincirini kursaydı biri bir gün
   * SKU'yu atlar ve aynı kod iki ekranda iki farklı cevap verirdi.
   *
   * ── SKU VE TEDARİKÇİ KODU NEDEN ÇARPANSIZ ─────────────────────────────────
   * Çarpan yalnız gerçek koli barkodunun bilgisidir (karar §1.2 — "adedi kodun kendisi söyler").
   * SKU bizim iç kimliğimiz, tedarikçi kodu onun sipariş dili; ikisinin "kaç adet" iddiası yoktur
   * ve 1 sayılır. `supplier_product.pack_qty` BİLEREK okunmuyor: o "bu tedarikçi koliyle satıyor"
   * bilgisidir, okutulan şeyin koli OLDUĞUNUN kanıtı değil.
   *
   * ── TEKİLLİK GARANTİSİ YALNIZ BARKODDA ────────────────────────────────────
   * `variant_barcode.code` global benzersiz; `sku` ve `supplier_code` DEĞİL (sku nullable serbest
   * metin, tedarikçi kodu tedarikçi başına). Çakışmada ilk satır döner — kaynak `source` alanında
   * yazdığı için ekran eşleşmenin kesinlik derecesini biliyor.
   */
  async findByCode(code: string): Promise<CodeMatch | null> {
    const barcode = await this.getByCode(code);
    if (barcode) {
      return { variantId: barcode.variantId, kind: barcode.kind, qtyPerCode: barcode.qtyPerCode, source: 'barcode' };
    }

    const bySku = await new ProductVariantService(this.supabase).findBySku(code);
    if (bySku) return { variantId: bySku.id, kind: 'unit', qtyPerCode: 1, source: 'sku' };

    const bySupplier = await new SupplierProductService(this.supabase).findBySupplierCode(code);
    if (bySupplier) return { variantId: bySupplier.variantId, kind: 'unit', qtyPerCode: 1, source: 'supplier_code' };

    return null;
  }
}
