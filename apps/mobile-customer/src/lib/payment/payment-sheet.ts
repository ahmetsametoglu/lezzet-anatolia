import { RevolutMerchantCardFormKit, RevolutPaymentsSDK, type PaymentError } from '@revolut/revolut-merchant-card-form';

/*
  Yerel ödeme kartı: form sağlayıcının kendi yüzeyidir, kart bilgisi ne koda ne sunucuya uğrar. Formun "başarılı" demesi müşterinin
  ödemeyi tamamladığıdır; siparişin onayı sunucuda yazılır ve ekran onu sipariş durum ucundan okur.
*/

/** Ödemenin başarısız olma sebepleri; ekran metnini kendi sözlüğünden kurar. */
export type PaymentFailureReason =
  /** Sağlayıcının açık anahtarı ya da kipi yok; ödeme bu derlemede yapılandırılmamış. */
  | 'configuration_missing'
  /** Form açılamadı: geçersiz ya da süresi dolmuş jeton, ağ, sağlayıcı kurulumu. */
  | 'setup_failed'
  /** Sağlayıcı zaman aşımına düştü; müşteri tekrar deneyebilir. */
  | 'timeout'
  /** Ödeme reddedildi ya da tamamlanamadı (kart reddi, 3-D Secure düşmesi). */
  | 'declined';

/** Kartın sonucu. Vazgeçmek hata değildir: sipariş yerinde durur ve ödeme tekrar denenebilir. */
export type PaymentSheetOutcome =
  | { status: 'succeeded' }
  | { status: 'canceled' }
  | {
      status: 'failed';
      reason: PaymentFailureReason;
      /** Sağlayıcının kendi cümlesi; teşhis içindir, ekranda gösterilmez. */
      providerMessage: string | null;
    };

interface PaymentSheetInput {
  /** Sipariş ucunun döndürdüğü ödeme jetonu; tutar jetonun siparişindedir ve istemciden geçmez. */
  paymentToken: string;
}

type PaymentConfig = { configured: false } | { configured: true; publicKey: string; environment: 'production' | 'sandbox' };

/** `EXPO_PUBLIC_*` derleme anında satır içine yazılır, dinamik erişim gömülmez; okumalar bu yüzden statik. */
function paymentConfig(): PaymentConfig {
  const publicKey = process.env.EXPO_PUBLIC_REVOLUT_PUBLIC_KEY;
  const mode = process.env.EXPO_PUBLIC_REVOLUT_MODE;
  if (!publicKey || (mode !== 'sandbox' && mode !== 'live')) return { configured: false };
  return { configured: true, publicKey, environment: mode === 'live' ? 'production' : 'sandbox' };
}

const REASON_BY_ERROR: Record<PaymentError['code'], PaymentFailureReason> = {
  failed: 'declined',
  declined: 'declined',
  timeout: 'timeout',
  orderNotFound: 'setup_failed',
  orderNotAvailable: 'setup_failed',
  internalError: 'setup_failed',
};

function failure(reason: PaymentFailureReason, message?: string): PaymentSheetOutcome {
  return { status: 'failed', reason, providerMessage: message ?? null };
}

/** SDK süreç ömründe bir kez kurulur; kurulum düşerse sonraki ödeme yeniden dener. */
let configuredKey: string | null = null;

/** Ödeme formunu açar ve sonucu adlandırır; hata fırlatmaz, çünkü fırlayan hata müşteriyi "işleniyor"da bırakırdı. */
export async function presentPayment(input: PaymentSheetInput): Promise<PaymentSheetOutcome> {
  const config = paymentConfig();
  if (!config.configured) return failure('configuration_missing');

  try {
    if (configuredKey !== config.publicKey) {
      await RevolutPaymentsSDK.configure(config.publicKey, config.environment);
      configuredKey = config.publicKey;
    }
    const result = await RevolutMerchantCardFormKit.pay(input.paymentToken);
    if (result.status !== 'failure') return result.status === 'success' ? { status: 'succeeded' } : { status: 'canceled' };
    return failure(REASON_BY_ERROR[result.error.code], result.error.message);
  } catch (error) {
    // Yerel modül sonucu ret olarak da verebilir; kodu tanınırsa aynı sebebe, tanınmazsa kurulum hatasına düşer.
    const code = (error as { code?: string } | null)?.code;
    const reason = code && code in REASON_BY_ERROR ? REASON_BY_ERROR[code as PaymentError['code']] : 'setup_failed';
    return failure(reason, error instanceof Error ? error.message : String(error));
  }
}
