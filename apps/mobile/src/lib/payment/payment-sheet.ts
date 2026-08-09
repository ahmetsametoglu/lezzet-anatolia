import { initPaymentSheet, PaymentSheetError, presentPaymentSheet } from '@stripe/stripe-react-native';
import { brand } from '@lezzet/brand';
import { MERCHANT_COUNTRY_CODE, stripeConfig } from './stripe-config';

/*
  YEREL ÖDEME KARTI — ince kapı.

  Kullanıcı kararı (09.08): ödeme uygulamadan ÇIKMADAN alınır; kart alanı Stripe'ın kendi yerel
  kartıdır (`PaymentSheet`), Apple Pay / Google Pay dahil. Kart bilgisi ne bizim koda ne sunucumuza
  uğrar — PCI kapsamı sağlayıcıda kalır (web'in `PaymentElement` kararıyla aynı gerekçe).

  ── BU DOSYA NE YAPMAZ ──────────────────────────────────────────────────────
  Ağa çıkmaz, sipariş bilmez, ekran yönlendirmez. `clientSecret` ÇAĞIRANDAN gelir: onu üreten uç
  (`POST /api/v1/payments/intents`) tutarı sunucuda çözer, yani ödemenin miktarı istemcinin
  elinden geçmez. Kapının tek işi kartı açmak ve sonucu ADLANDIRMAKTIR.

  ── "BAŞARILI" NE DEMEK, NE DEMEK DEĞİL ─────────────────────────────────────
  `succeeded` = müşteri ödemeyi tamamladı. Siparişin "ödendi" olması AYRI bir gerçektir ve
  webhook'la yazılır (`apps/web/app/api/webhooks/stripe`); ekran onu ödeme durumu ucundan
  (`GET /api/v1/payments/intents/:id` → `orderPaymentStatus`) okur. İkisini tek cevaba katlamak,
  henüz yazılmamış bir tahsilatı yazılmış göstermek olurdu (CLAUDE §1).
*/

/** Ödemenin BAŞARISIZ olma sebepleri — hepsi adlı; ekran metnini kendi sözlüğünden kurar. */
export type PaymentFailureReason =
  /** Yayınlanabilir anahtar yok — ödeme hiç yapılandırılmamış (`stripe-config.ts` künyesi). */
  | 'configuration_missing'
  /** Kart açılamadı: geçersiz/tükenmiş `clientSecret`, ağ, sağlayıcı kurulumu. */
  | 'setup_failed'
  /** Sağlayıcı zaman aşımına düştü — müşteri tekrar deneyebilir. */
  | 'timeout'
  /** Ödeme reddedildi ya da tamamlanamadı (kart reddi, doğrulama düşmesi). */
  | 'declined';

/**
 * Kartın sonucu. `canceled` bir HATA DEĞİLDİR: müşteri vazgeçti, sipariş yerinde duruyor ve
 * tekrar denenebilir — `failed` ile aynı kefeye konsaydı ekran ona hata gösterirdi.
 */
export type PaymentSheetOutcome =
  | { status: 'succeeded' }
  | { status: 'canceled' }
  | {
      status: 'failed';
      reason: PaymentFailureReason;
      /**
       * Sağlayıcının kendi cümlesi — TEŞHİS içindir, ekranda gösterilmez (hata metni ekranın
       * sözlüğünde yaşar, i18n'li). Yokluğu bilgi eksikliğidir, boş metin değil: `null`.
       */
      providerMessage: string | null;
    };

export interface PaymentSheetInput {
  /**
   * `POST /api/v1/payments/intents` cevabındaki `clientSecret`.
   *
   * Tutar BİLEREK alınmıyor: kart tahsil edilecek parayı niyetin kendisinden okur ve o niyet
   * sunucuda, siparişin toplamından doğdu. Buraya bir tutar parametresi koymak, ödemenin
   * miktarını belirlemeyen ama belirliyormuş gibi duran bir alan olurdu.
   */
  clientSecret: string;
}

/**
 * Sağlayıcı hata kodu → bizim sebebimiz. `Record` TAM: SDK yeni bir kod eklerse bu dosya
 * DERLENMEZ — sessizce "bilinmiyor"a düşen bir ödeme hatası, gözden saklanan bir hatadır.
 *
 * `Canceled` burada YOK çünkü o bir hata dalı değil; çağıran onu koddan ÖNCE ayırır.
 */
const REASON_BY_SHEET_ERROR: Record<Exclude<PaymentSheetError, PaymentSheetError.Canceled>, PaymentFailureReason> = {
  [PaymentSheetError.Failed]: 'declined',
  [PaymentSheetError.Timeout]: 'timeout',
};

function failure(reason: PaymentFailureReason, message?: string): PaymentSheetOutcome {
  return { status: 'failed', reason, providerMessage: message ?? null };
}

/**
 * Ödeme kartını açar ve sonucu adlandırır.
 *
 * İki adım tek çağrıda: `initPaymentSheet` (yapılandırma + niyet) ve `presentPaymentSheet` (kartın
 * gösterilmesi). Çağırana ikiye bölünmüş bir yaşam döngüsü verilmiyor — arada tek meşru karar
 * yok ve ikiye bölmek, "kurulmuş ama açılmamış" bir kartın ekranda unutulmasına kapı açardı.
 *
 * **Cüzdanlar yapılandırma varsa açılır:** Google Pay her zaman (yerel modül manifest'te açık),
 * Apple Pay yalnız KAYITLI ticari kimlik varken — kayıtsızken kartta hiç görünmez, çalışmayan bir
 * düğme göstermektense yokluğu dürüsttür.
 *
 * **Hata fırlatmaz, değer döner** (motorların kuralı, 03.1): ödeme akışında fırlatılan bir hata,
 * çağıranın unuttuğu anda müşteriyi boş ekranda bırakır.
 */
export async function presentPayment(input: PaymentSheetInput): Promise<PaymentSheetOutcome> {
  const config = stripeConfig();
  if (!config.configured) return failure('configuration_missing');

  const setup = await initPaymentSheet({
    paymentIntentClientSecret: input.clientSecret,
    // Android'de ZORUNLU ve boş olamaz; marka adı tek kaynaktan (`@lezzet/brand`).
    merchantDisplayName: brand.name,
    // Kart dışı gecikmeli yöntem (SEPA, Boleto) kapalı: niyet zaten yalnız `card` ile açılıyor
    // (`payments.ts`), açık bırakmak sunucuyla ayrışan bir vaat olurdu.
    allowsDelayedPaymentMethods: false,
    googlePay: { merchantCountryCode: MERCHANT_COUNTRY_CODE, testEnv: config.googlePayTestEnv },
    ...(config.appleMerchantId ? { applePay: { merchantCountryCode: MERCHANT_COUNTRY_CODE } } : {}),
  });

  if (setup.error) return failure('setup_failed', setup.error.localizedMessage ?? setup.error.message);

  const result = await presentPaymentSheet();
  if (!result.error) return { status: 'succeeded' };

  if (result.error.code === PaymentSheetError.Canceled) return { status: 'canceled' };
  return failure(
    REASON_BY_SHEET_ERROR[result.error.code],
    result.error.localizedMessage ?? result.error.message,
  );
}
