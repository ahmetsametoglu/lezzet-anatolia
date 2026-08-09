import { z } from 'zod';
import { LocalizedTextDraftSchema } from '../primitives/localized-text.schema';

// ProductVariant — satılabilir birim (fiyat/stok varyant seviyesinde). 0005 migration, DATA_MODEL.
// Varyantsız görünen ürün de tek (varsayılan) varyant taşır → fiyat/stok mantığı her yerde aynı.
//
// `label` müşteriye görünen BOY etiketidir ("700 g tepsi") → çok dilli. Zorunlu (`LocalizedTextSchema`)
// değil TASLAK şema: tek boylu üründe etiket yoktur, müşteri seçici görmez; "en az bir dil" kuralı
// yalnız birden çok varyantı olan üründe anlamlı ve o kural formda yaşar (ProductFormSchema).
export const ProductVariantSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  label: LocalizedTextDraftSchema,
  netWeightG: z.number().int().nullable(),
  /**
   * Paket içi adet ("12'li baklava"). Gramajın YERİNE değil YANINA: bir varyant hem 36 adet hem
   * 2500 g olabilir, ikisi ayrı soruya cevap verir. `null` = adet bilgisi yok (dökme ürün) —
   * sıfır DEĞİL, çünkü sıfır "içinde hiç parça yok" demek olurdu.
   */
  piecesCount: z.number().int().nullable(),
  minStockQty: z.number().int().nullable(),
  sku: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type ProductVariant = z.infer<typeof ProductVariantSchema>;

export const ProductVariantInsertSchema = z.object({
  productId: z.string().uuid(),
  label: LocalizedTextDraftSchema.optional(),
  netWeightG: z.number().int().nullish(),
  piecesCount: z.number().int().nullish(),
  minStockQty: z.number().int().nullish(),
  sku: z.string().nullish(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type ProductVariantInsert = z.infer<typeof ProductVariantInsertSchema>;

export const ProductVariantUpdateSchema = ProductVariantSchema.partial().required({ id: true });
export type ProductVariantUpdate = z.infer<typeof ProductVariantUpdateSchema>;

// Form varyant satırı (düzenleme senkronu): `id` varsa güncelle, yoksa yeni ekle. ProductVariantSchema'dan
// TÜRETİLİR (id opsiyonel; net/sku/min nullable). productId servis tarafından yönetilir; `sortOrder` de
// öyle — sıra satırın form dizisindeki KONUMUDUR (sürükle-bırak diziyi taşır, servis indeksi yazar).
export const ProductVariantEntrySchema = ProductVariantSchema.pick({
  label: true,
  netWeightG: true,
  /**
   * Paket içi adet. **Bir tur OPSİYONEL kaldı ve sebebi kayıt olarak duruyor:** kolon geldiğinde
   * (05.14) formda girdisi yoktu; zorunlu yapmak hem operasyon formunun derlemesini kırar hem de
   * alanı hiç göstermeyen bir ekranın, üretecin bulduğu değeri her kayıtta `null`'a ezmesine yol
   * açardı. Form aynı gün yazıldı (operasyon şeridi, 09.08) ve alan artık her kayıtta gönderiliyor
   * — ölçüldü: `variant-editor` · `product-form-schema` (yükleme + gönderme) · `createProductAction`.
   */
  piecesCount: true,
  minStockQty: true,
  sku: true,
  isActive: true,
}).extend({ id: z.string().uuid().optional() });
export type ProductVariantEntry = z.infer<typeof ProductVariantEntrySchema>;
