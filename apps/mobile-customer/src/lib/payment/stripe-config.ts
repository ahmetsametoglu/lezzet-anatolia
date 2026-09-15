/*
  Yerel ödeme kartının YAPILANDIRMASI — tek okuma yeri.

  ── NEDEN `lib/env.ts` DEĞİL ────────────────────────────────────────────────
  `env.ts`in sözleşmesi "eksikse FIRLAT"tır ve orada doğrudur: API adresi ya da Supabase anahtarı
  olmadan uygulamanın açılmaması gerekir. Ödeme anahtarı ise farklı bir sınıftır — anahtarsız bir
  yerel derleme (katalog gezme, giriş, sipariş okuma) tamamen meşrudur; düşmesi gereken tek şey
  ödeme kartıdır. O yüzden burada yokluk bir istisna değil, ADLI BİR HÂLDİR (`configured: false`)
  ve karta basıldığında `configuration_missing` retine dönüşür. Sessiz undefined YOK, gürültülü
  çökme de yok (CLAUDE §1: ölçülemeyen değer sıfır değildir — burada "anahtar yok" ≠ "ödeme geçti").

  ── OKUMALAR STATİK ─────────────────────────────────────────────────────────
  `EXPO_PUBLIC_*` değerlerini Metro DERLEME anında satır içine yazar; `process.env[name]` gibi
  dinamik erişim gömülmez ve üretimde sessizce `undefined` döner (`env.ts` künyesinin aynı uyarısı).

  ── GİZLİ ANAHTAR BURADA ARANMAZ ────────────────────────────────────────────
  Yalnız YAYINLANABİLİR anahtar (`pk_...`) mobil pakete girer. `STRIPE_SECRET_KEY` sunucudadır
  (`apps/mobile-api`) ve bundle'a hiçbir koşulda giremez (02-mimari §4).
*/

/**
 * İşletmenin kurulu olduğu ülke (ISO 3166-1 alpha-2) — Apple/Google Pay cüzdanlarının zorunlu
 * alanı. Dil DEĞİLDİR: `brand.defaultLocale` Fransızcadır ama o müşterinin dilidir; buradaki
 * değer satıcının ülkesidir ve kart ağı bunu ödeme kimliği olarak kullanır.
 */
export const MERCHANT_COUNTRY_CODE = 'FR';

/**
 * Stripe yapılandırması — `configured: false` iken ödeme kartı HİÇ açılmaz.
 *
 * Ayrık birlik, çünkü iki hâl iki farklı şey biliyor: yapılandırılmışsa anahtar KESİN vardır ve
 * çağıran `?` ile kontrol etmek zorunda kalmaz.
 */
type StripeConfig =
  | { configured: false }
  | {
      configured: true;
      publishableKey: string;
      /**
       * Apple Pay ticari kimliği — Apple Developer'da KAYITLI değilse `null`. Üç yer aynı değeri
       * okur (iOS entitlement'ı `app.config.ts`, `StripeProvider`, kartın Apple Pay bölümü) ve
       * üçü de aynı anda açılır: yarısı açık bir Apple Pay, müşteriye çalışmayan bir düğme
       * göstermek olurdu.
       */
      appleMerchantId: string | null;
      /**
       * Google Pay TEST ortamı mı — ayrı bir değişkenden değil, ANAHTARIN KENDİSİNDEN türetilir.
       * İki kaynak olsaydı biri gün gelip ötekinden sapardı ve canlı anahtarla test cüzdanı
       * (ya da tersi) sessizce eşleşirdi.
       */
      googlePayTestEnv: boolean;
    };

/** Stripe test anahtarlarının değişmez öneki — canlı anahtar `pk_live_` ile başlar. */
const TEST_KEY_PREFIX = 'pk_test_';

export function stripeConfig(): StripeConfig {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return { configured: false };

  return {
    configured: true,
    publishableKey,
    appleMerchantId: process.env.EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_ID ?? null,
    googlePayTestEnv: publishableKey.startsWith(TEST_KEY_PREFIX),
  };
}
