import { z } from 'zod';

/**
 * KARGO KUTUSU — taşıyıcıya verilen DIŞ kutunun tipi (07.12 · `0052_shipping_box.sql`).
 *
 * **Varyantın kendi ambalajıyla karıştırılmaz.** `product_variant.packed_*` "bu ürün paketiyle
 * ne kadar yer kaplar" der; bu ise "onları içine koyduğumuz kutu ne" der. Gönderi ağırlığı
 * ikisinden birlikte çıkar:
 *
 *     gönderi ağırlığı = Σ(ambalajlı ürün ağırlığı × adet) + kutunun darası
 *     gönderi ölçüsü   = kutunun dış ölçüsü
 *
 * **`warehouseId === null` → SİSTEM ŞABLONU.** Şablon doğrudan seçilemez: depo onu benimsediğinde
 * kendi satırı olarak KOPYALANIR (kullanıcı kararı 28.08). Kopyalamanın bağlamaya üstünlüğü,
 * deponun kutuyu bırakabilmesi ve şablon düzeltmesinin fiziksel kutuyu değiştirmemesidir —
 * Strasbourg'daki kutu, birinin şablonu düzeltmesiyle küçülmez.
 *
 * Kural veride: `order_box`taki bileşik FK şablonun da başka deponun kutusunun da seçilmesini
 * engelliyor (migration künyesi).
 */
export const ShippingBoxSchema = z.object({
  id: z.string().uuid(),
  /** `null` = sistem şablonu (seçilemez, kopyalanır). Dolu = o deponun kutusu. */
  warehouseId: z.string().uuid().nullable(),
  /** Operatörün listede gördüğü ad. Ölçüyü adın içinde tekrarlamak serbest — depocu adı okur. */
  name: z.string().min(1),
  /** Dış ölçü, MİLİMETRE (gerekçe `ProductVariantSchema.packedLengthMm` künyesinde). */
  lengthMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  /**
   * BOŞ kutunun ağırlığı (g). Gönderi ağırlığına eklenir; unutulursa taşıyıcı farkı faturada
   * düzeltir. **`0` meşru bir değerdir** (poşet/zarf) — ölçülerin `> 0` kuralından ayrı.
   */
  tareG: z.number().int().nonnegative(),
  /** Azami İÇERİK ağırlığı (dara hariç). `null` = sınır bilinmiyor, sıfır DEĞİL. */
  maxContentG: z.number().int().positive().nullable(),
  /** Kutu tükendi / kullanılmıyor. Silinmez, kapatılır — geçmiş gönderiler ona referans verir. */
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type ShippingBox = z.infer<typeof ShippingBoxSchema>;

export const ShippingBoxInsertSchema = ShippingBoxSchema.omit({ id: true, createdAt: true }).partial({
  isActive: true,
  sortOrder: true,
  tareG: true,
  maxContentG: true,
});
export type ShippingBoxInsert = z.infer<typeof ShippingBoxInsertSchema>;

export const ShippingBoxUpdateSchema = ShippingBoxSchema.partial().required({ id: true });
export type ShippingBoxUpdate = z.infer<typeof ShippingBoxUpdateSchema>;

/**
 * Hacim (mm³) — koli planının "sığar mı" sorusunun tabanı.
 *
 * **Motor tarafına AİT bir hesap değil, şeklin kendi özelliği**: kutu üç ölçüsüyle tanımlı ve
 * hacmi onlardan çıkar. `domain-core`'a koymak, tipin kendi cevabını verebildiği bir soruyu
 * ikinci bir yere taşımak olurdu (`CLAUDE §1` duplication).
 */
export function boxVolumeMm3(box: Pick<ShippingBox, 'lengthMm' | 'widthMm' | 'heightMm'>): number {
  return box.lengthMm * box.widthMm * box.heightMm;
}
