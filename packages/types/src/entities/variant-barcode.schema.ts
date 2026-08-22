import { z } from 'zod';

/**
 * ÜRÜN BARKODU — taranabilir kod ↔ varyant eşlemesi (Modül 23 · `0047_barcode.sql`).
 *
 * DIŞ dünyanın kimliği: paketin üstünde basılı EAN-13, kolinin üstünde GTIN-14 — "bu hangi mal"
 * sorusunun cevabı. Bizim bastığımız kutu QR'ı ("bu hangi kayıt") AYRI iştir ve burada YAŞAMAZ.
 *
 * ── NEDEN VARYANTA BİR KOLON DEĞİL, AYRI TABLO (karar §1.2) ─────────────────
 * Aynı varyantın birden çok kodu olur ve **her kod kaç adet olduğunu kendisi taşır**: paket kodu
 * 1, koli kodu kolinin içindeki adet. Çarpan tedarikçide DURMAZ (`supplierProduct.packQty` "bu
 * tedarikçi koliyle satıyor" bilgisidir; iki tedarikçinin kolisi farklı olabilir) — okutulan şey
 * kolinin kendi barkodudur, adedi de o söyler.
 *
 * ── ÖĞRENEN EŞLEME (karar §1.3) ─────────────────────────────────────────────
 * Tablo mal kabulde kendini doldurur: tanınmayan kod için ekran "bu kod hangi ürün?" diye sorar,
 * cevap buraya yazılır, ikinci gelişte tanınır. `createdBy` eşlemenin izi (null = sistem/seed
 * kaydı); geri alma = satırı silmek (web varyant editörü). Bir kod İKİ varyanta bağlanamaz —
 * benzersizlik veride (`variant_barcode_code_uq`).
 */

export const BARCODE_KINDS = ['unit', 'case'] as const;
export const BarcodeKindEnum = z.enum(BARCODE_KINDS);
export type BarcodeKind = z.infer<typeof BarcodeKindEnum>;

export const VariantBarcodeSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  /** Okutulan ham kod — EAN-13/GTIN-14 tipik ama biçim ZORLANMAZ: iç etiketler ve QR'lar da
      taranabilir; "geçersiz biçim" reddi gerçek bir kolinin kabulünü durdururdu. */
  code: z.string().min(1),
  kind: BarcodeKindEnum,
  /** Bu kod okutulunca kaç adet sayılır — `unit` için daima 1 (kısıt veride de). */
  qtyPerCode: z.number().int().positive(),
  /** Eşlemeyi öğreten kişi; null = sistem kaydı (seed/içe aktarım). */
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type VariantBarcode = z.infer<typeof VariantBarcodeSchema>;

export const VariantBarcodeInsertSchema = VariantBarcodeSchema.pick({
  variantId: true,
  code: true,
}).extend({
  kind: BarcodeKindEnum.optional(),
  qtyPerCode: z.number().int().positive().optional(),
  createdBy: z.string().uuid().nullable().optional(),
});
export type VariantBarcodeInsert = z.infer<typeof VariantBarcodeInsertSchema>;

/** Güncellenebilir alanlar — kodun kendisi güncellenmez: yanlış kod düzeltilmez, SİLİNİP yeniden
    öğrenilir (eşleme tarihçesiz bir beyandır, künye migration'da). */
export const VariantBarcodeUpdateSchema = VariantBarcodeSchema.pick({})
  .extend({ kind: BarcodeKindEnum.optional(), qtyPerCode: z.number().int().positive().optional() });
export type VariantBarcodeUpdate = z.infer<typeof VariantBarcodeUpdateSchema>;
