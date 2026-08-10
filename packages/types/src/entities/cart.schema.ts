import { z } from 'zod';

// Cart — sunucu sepeti (DOMAIN §4, §5). Müşteri başına TEK satır: sepet bir liste değil, bir durum.
//
// **Sepette stok ayrılmaz** — rezervasyon checkout başlarken yapılır. Sepet yalnız niyet kaydıdır.
//
// **Sepetteki fiyat bağlayıcı DEĞİLDİR** (DOMAIN §5, karar 27.07): gösterim ve değişiklik tespiti
// içindir. Bağlayıcı fiyat CHECKOUT BAŞLANGICINDA çözülür ve orada sabitlenir — stok ayırma ve
// ödeme oturumuyla aynı 30 dk'lık pencerede (§4). Sepet sunucuda aylarca bekleyebilir; oradaki
// fiyatı bağlayıcı saymak maliyeti oynayan üründe zarar, fiyat düştüğünde müşteriye haksızlıktır.

export const CartItemSchema = z.object({
  /**
   * Satılan birim. **Paket satırında null** — paketin varyantı yoktur, satılan şey paketin
   * kendisidir (DOMAIN §13). İkisinden biri daima doludur; ikisi birden asla.
   */
  variantId: z.string().uuid().nullish(),
  /**
   * Paket satırı (05.5). Sepette paket TEK satırdır: kalemleri burada açılmaz, tek fiyatla durur —
   * müşteri içeriğini düzenleyemez. Kalemlere ayrılma SİPARİŞTE olur (`order_item.bundle_id`),
   * çünkü fatura her kalemin KDV'sini kendi ürününden almak zorunda.
   */
  bundleId: z.string().uuid().nullish(),
  qty: z.number().int().positive(),
  /**
   * Eklendiği andaki birim fiyat (kanal tabanında: b2c TTC, b2b HT). **Bağlayıcı değil** —
   * checkout'ta yeniden çözülen fiyatla karşılaştırılır: arttıysa müşteriye bildirilip onay istenir,
   * düştüyse sessizce uygulanır.
   */
  unitPrice: z.number().nonnegative(),
  /**
   * Partiye bağlı teklif satırıysa hangi parti — miktar tavanı ve rezervasyon çıpası (DOMAIN §5).
   * İndirim PARTİYE aittir (sebebi o partinin tarihidir): parti checkout'a kadar tükenirse indirim
   * başka partiye taşınmaz, kalem aynı bildirim akışıyla normal fiyata döner.
   */
  stockId: z.string().uuid().nullish(),
  addedAt: z.string(),
});
export type CartItem = z.infer<typeof CartItemSchema>;

export const CartSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(CartItemSchema),
  /**
   * Sonraya kaydedilenler (K35) — sepetten çıkmış ama VAZGEÇİLMEMİŞ kalemler. Teslimat yerine
   * gönderilemeyen ürün silinmez, buraya taşınır: alışveriş ölmez, sepet bölünür.
   *
   * Aynı şekli taşır çünkü aynı şeyin iki hâli; ayrımları yalnız BUGÜN alınıp alınamayacağı.
   */
  savedItems: z.array(CartItemSchema).default([]),
  updatedAt: z.string(),
});
export type Cart = z.infer<typeof CartSchema>;

export const CartInsertSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(CartItemSchema).optional(),
  savedItems: z.array(CartItemSchema).optional(),
  /**
   * Son dokunuş damgası — **insert şemasında da olmak ZORUNDA** (10.08, mobil şeridin ölçümü).
   *
   * Sepet tek yazma yolundan geçiyor ve o yol `upsert` kullanıyor; `upsert` girdisini
   * `insertSchema.parse`ten geçirdiği için alan burada yoksa Zod onu **sessizce atar**. Servis
   * damgayı gerçekten gönderiyordu, künyesinde de "her dokunuşta tazelenir" yazıyordu — ama damga
   * yazıma hiç ulaşmıyor, kolon yalnız `default now()` ile ve yalnız INSERT'te doluyordu. Ölçüldü:
   * bir sepetin damgası 10:29, aynı sepetin son kalemi 15:27'de eklenmiş — beş saat sapma.
   *
   * Alan `CartUpdateSchema`'da vardı, burada yoktu; asimetri gözden kaçmıştı ve çağrı yerindeki
   * `as CartInsert` dönüşümü tip denetimini de susturuyordu (o cast de kaldırıldı). Ders şema
   * ötesi: **`as` ile susturulan bir kapı, kapının olmaması demektir.**
   */
  updatedAt: z.string().optional(),
});
export type CartInsert = z.infer<typeof CartInsertSchema>;

export const CartUpdateSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(CartItemSchema).optional(),
  savedItems: z.array(CartItemSchema).optional(),
  updatedAt: z.string().optional(),
});
export type CartUpdate = z.infer<typeof CartUpdateSchema>;
