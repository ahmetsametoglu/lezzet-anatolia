import { loadStripe, type Stripe as StripeClient } from '@stripe/stripe-js';

/**
 * Tarayıcı tarafı Stripe.js — `<Elements>` sağlayıcısının beklediği tekil örnek.
 *
 * `lib/stripe.ts`'ten AYRI durur ve ayrı durması şart: oradaki gizli anahtarla konuşur ve
 * `server-only` zincirinin içindedir. Buradaki **yayımlanabilir** anahtar tarayıcıya gider —
 * ikisini tek dosyada tutmak, gizli anahtarı istemci paketine sızdırmanın en kısa yoludur.
 *
 * `loadStripe` bir kez çağrılır: her çağrı Stripe.js betiğini yeniden indirir ve `<Elements>`
 * yeniden monte olur — kart alanına yazılmış veri o anda silinir.
 *
 * Anahtar yoksa `null` döner, HATA ATMAZ: ödeme yapılandırılmamış bir yerelde checkout'un geri
 * kalanı (adres, gün, kapıda ödeme) çalışmaya devam etmeli. Sunucu tarafı zaten aynı hâlde
 * `provider_unavailable` diyor — ekran da o cevabı gösterir, beyaz sayfa değil.
 */
let cached: Promise<StripeClient | null> | null = null;

export function clientStripe(): Promise<StripeClient | null> | null {
  if (cached) return cached;
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  cached = loadStripe(key);
  return cached;
}
