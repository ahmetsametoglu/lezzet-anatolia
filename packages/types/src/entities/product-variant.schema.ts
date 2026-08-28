import { z } from 'zod';
import { LocalizedTextDraftSchema } from '../primitives/localized-text.schema';

/**
 * Porsiyon türü — `item` ayrı ayrı ürünler, `slice` tek ürünün dilimleri. Künyesi
 * `ProductVariantSchema.portionKind`de; kaynağı basılı katalogun kendi beyanı (`(12 slice)`).
 */
export const PortionKindEnum = z.enum(['item', 'slice']);
export type PortionKind = z.infer<typeof PortionKindEnum>;

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
  /**
   * Porsiyonun TÜRÜ — `pieces_count` "kaç" der, bu "neyin kaçı" der (19.08).
   *
   * `item` = ayrı ayrı ürünler (4'lü simit paketi) · `slice` = tek ürünün dilimleri (12 dilimlik
   * cheesecake) · `null` = tek parça, porsiyon sorusu yok. Vitrin ikisine aynı kelimeyi yazamaz:
   * "12 adet cheesecake" 12 pasta demek olurdu.
   */
  portionKind: PortionKindEnum.nullable(),
  /**
   * ── AMBALAJLI ÜRÜN ÖLÇÜSÜ (07.12) ─────────────────────────────────────────
   * Taşınan şeyin ağırlığı: ürün + KENDİ ambalajı. `netWeightG` ile karıştırılmaz — o INCO
   * beyanıdır ve €/kg gösterimini besler (içindeki gıdanın ağırlığı). Kargo tarifesi bunu ister.
   *
   * `null` = ÖLÇÜLMEDİ, sıfır DEĞİL: ölçüsüz varyant için canlı teklif alınmaz ve ekran "ölçüsü
   * eksik" der. Sıfır, koli planına "hiç yer kaplamıyor" diye okunurdu (CLAUDE §1).
   */
  packedWeightG: z.number().int().positive().nullable(),
  /**
   * Dış ölçüler — **milimetre**: ondalık kalınlık (1,5 cm) tam sayı alanında sessizce yuvarlanır.
   * Sağlayıcı `mm` birimini doğrudan kabul ediyor, sayı dönüşümsüz tele giriyor.
   *
   * **Üçü birlikte yaşar ya da hiç yaşamaz** — kısıt veride (`product_variant_packed_dims_all_or_none`).
   * İkisi dolu biri boş bir kutu hiçbir soruya cevap vermez ama ekran "ölçüsü var" diye okur.
   */
  packedLengthMm: z.number().int().positive().nullable(),
  packedWidthMm: z.number().int().positive().nullable(),
  packedHeightMm: z.number().int().positive().nullable(),
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
  portionKind: PortionKindEnum.nullish(),
  packedWeightG: z.number().int().positive().nullish(),
  packedLengthMm: z.number().int().positive().nullish(),
  packedWidthMm: z.number().int().positive().nullish(),
  packedHeightMm: z.number().int().positive().nullish(),
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
  /**
   * Porsiyon türü — **formda bugüne kadar YOKTU** ve yalnız besleme yazıyordu (ölçüldü 28.08).
   * Operatörün elle açtığı her varyant `null` porsiyon türüyle doğuyordu, yani "12 dilim" ile
   * "12 adet" ayrımı yalnız üretecin dokunduğu kayıtlarda vardı. Ambalaj ölçüsüyle aynı bölmeye
   * giriyor: ikisi de "bu paket fiziksel olarak nedir" sorusunun cevabı.
   */
  portionKind: true,
  packedWeightG: true,
  packedLengthMm: true,
  packedWidthMm: true,
  packedHeightMm: true,
  minStockQty: true,
  sku: true,
  isActive: true,
}).extend({ id: z.string().uuid().optional() });
export type ProductVariantEntry = z.infer<typeof ProductVariantEntrySchema>;
