/**
 * **Ödemesi beklenen taslakta ne yapılır** (07.18) — sağlayıcı ne dedi ve ödeme penceresi açık mı,
 * ondan çıkan SAF karar.
 *
 * Neden var: siparişe dönüşün tek yolu webhook'tu. Olay gelmezse (tünel kapalı, uç yanlış
 * yapılandırılmış, sağlayıcı gecikmesi) taslak süresiz "onaylanıyor"da kalıyordu; 30 dakika sonra stok
 * ayırması düşse bile sipariş ne onaylanıyor ne iptal ediliyordu ve müşteri yeniden ödeyince eski
 * ödeme durdurulamıyordu. Ödeme sayfası ve zamanlayıcı artık sağlayıcıya soruyor; cevaba göre
 * yapılacak şey burada — iki çağıran aynı kuralı okur.
 */

/** Sağlayıcıdaki ödemenin durumu — Stripe PaymentIntent `status` kümesinin aynası. */
export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';

export const PAYMENT_INTENT_STATUSES: readonly PaymentIntentStatus[] = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
  'requires_capture',
  'canceled',
  'succeeded',
];

export type DraftPaymentDecision =
  /** Para alındı — webhook'la aynı onay yolundan geçer. */
  | 'confirm'
  /** Henüz karar yok: banka işliyor ya da müşteri hâlâ ödeme adımında. */
  | 'wait'
  /** Ödeme gelmeyecek: sağlayıcıdaki ödeme ve taslak iptal edilir. */
  | 'cancel';

export function decideDraftPayment(input: {
  status: PaymentIntentStatus;
  /** Stok ayırması hâlâ duruyor mu — 30 dakikalık ödeme penceresi. */
  windowOpen: boolean;
}): DraftPaymentDecision {
  switch (input.status) {
    // Para alındı: pencere kapanmış olsa da onaylanır. Mal o arada bittiyse onay yolunun geç ödeme
    // kuralı (`decideLatePayment`) parayı iade eder — bu karar onun işine karışmaz.
    case 'succeeded':
      return 'confirm';
    // Banka işliyor, ya da para ayrılmış ama tahsil edilmemiş (elle tahsilat kullanmıyoruz; görülürse
    // para müşterinin hesabından ayrılmıştır). Pencere kapansa da İPTAL EDİLMEZ — para gelebilir.
    case 'processing':
    case 'requires_capture':
      return 'wait';
    case 'canceled':
      return 'cancel';
    // Müşteri ödemeyi bitirmedi (kart girilmedi, 3-D Secure yarım kaldı, kart reddedildi): pencere
    // açıkken hâlâ deneyebilir; kapandıysa ödeme gelmeyecek.
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
      return input.windowOpen ? 'wait' : 'cancel';
  }
}
