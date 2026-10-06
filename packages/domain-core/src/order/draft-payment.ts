/**
 * Ödemesi beklenen taslakta ne yapılır: sağlayıcının durumu ve ödeme penceresinden çıkan saf karar. Webhook gelmezse ödeme sayfası ve
 * zamanlayıcı sağlayıcıya sorar; iki çağıran aynı kuralı okur ki taslak süresiz "onaylanıyor"da kalmasın.
 */

/** Sağlayıcıdaki ödemenin durumu; sözlük Revolut sipariş durumlarıdır, sağlayıcı uyarlaması kendi durumunu buna çevirir. */
export type ProviderPaymentStatus = 'pending' | 'processing' | 'authorised' | 'completed' | 'cancelled' | 'failed';

export type DraftPaymentDecision =
  /** Para alındı — webhook'la aynı onay yolundan geçer. */
  | 'confirm'
  /** Henüz karar yok: banka işliyor ya da müşteri hâlâ ödeme adımında. */
  | 'wait'
  /** Ödeme gelmeyecek: sağlayıcıdaki ödeme ve taslak iptal edilir. */
  | 'cancel';

export function decideDraftPayment(input: {
  status: ProviderPaymentStatus;
  /** Stok ayırması hâlâ duruyor mu — ödeme penceresi. */
  windowOpen: boolean;
}): DraftPaymentDecision {
  switch (input.status) {
    // Pencere kapanmış olsa da onaylanır; mal o arada bittiyse geç ödeme kuralı (`decideLatePayment`) parayı iade eder.
    case 'completed':
      return 'confirm';
    // Banka işliyor ya da para ayrılmış: pencere kapansa da iptal edilmez, çünkü para gelebilir.
    case 'processing':
    case 'authorised':
      return 'wait';
    case 'cancelled':
    case 'failed':
      return 'cancel';
    // Ödeme bitmedi (kart girilmedi, 3-D Secure yarım kaldı ya da kart reddedildi): pencere açıkken müşteri yeniden deneyebilir.
    case 'pending':
      return input.windowOpen ? 'wait' : 'cancel';
  }
}

/** Sağlayıcıda zaten kapanmış ödeme: iptal isteği gönderilmez, sağlayıcı kapalı ödemenin iptalini reddeder. */
export function isClosedPayment(status: ProviderPaymentStatus): boolean {
  return status === 'cancelled' || status === 'failed';
}
