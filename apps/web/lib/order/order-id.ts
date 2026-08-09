import { z } from 'zod';

/**
 * **Yoldaki sipariş kimliğini KABUL EDİLEBİLİR mi diye süzer** (08.5, 09.08 ölçümü).
 *
 * ── BULUNAN ARIZA ────────────────────────────────────────────────────────────
 * `/orders/[reference]` ve `/checkout/[reference]` segment adına rağmen **sipariş KİMLİĞİ** taşıyor
 * (ikisinin de künyesinde bilinçli bir karar olarak yazılı: referans numarası ancak onayla doğuyor).
 * Ama segment ne gelirse onu doğrudan servise veriyordu ve UUID olmayan her değer **veritabanı
 * hatasına** düşüyordu:
 *
 *   invalid input syntax for type uuid: "LA-26-DMUF3L"   → 500 + `error_log` kaydı
 *
 * Ölçüldü (09.08, gerçek tarayıcı): müşteri e-postasında/faturasında gördüğü referans numarasını
 * adres çubuğuna yazdığında hata sayfası görüyordu. Beklediği şey "böyle bir sipariş yok"tur.
 *
 * ── NEDEN 404, "referansla da ara" DEĞİL ─────────────────────────────────────
 * Referansla aramak ayrı ve daha büyük bir karar: `reference_no` müşteri başına tekil değil, tüm
 * sistemde tekil olmalı ve o kural bugün veride yazılı değil — yani "bul ve göster" yazmak,
 * doğruluğu kısıtla korunmayan bir arama açmak olurdu. Bu düzeltme yalnız **arızayı** kapatıyor:
 * geçersiz biçim artık sayfanın zaten verdiği cevabı alıyor (`notFound()`), yeni bir yetenek
 * eklemiyor. Referansla erişim istenirse kendi işidir.
 *
 * **Bulunamayan · başkasına ait · biçimi geçersiz — ÜÇÜ DE AYNI cevabı alır.** İlk ikisinin aynı
 * olması bir güvenlik kararıydı (ayrım söylenirse deneme yanılmayla başkasının sipariş kimliği
 * doğrulatılabilirdi); üçüncüsü o kararın dışında kalmıştı ve farkı **500 ile** ele veriyordu.
 */
const ORDER_ID = z.string().uuid();

/** Geçerliyse kimliğin kendisi, değilse `null` — çağıran `notFound()` der. */
export function orderIdOrNull(raw: string): string | null {
  const parsed = ORDER_ID.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
