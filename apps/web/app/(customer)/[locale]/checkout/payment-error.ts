/*
  Kartın düştüğü anın cümlesi checkout'tan siparişin sayfasına taşınır; cümle sağlayıcının ret türünden kurulur ve sunucu onu
  bilmez. Tarayıcı deposu kapalıysa not düşer: sayfa "ödemesi gerçekleşmedi" cümlesini zaten söylüyor.
*/

const KEY_PREFIX = 'lezzet:payment-error:';

export function rememberPaymentError(orderId: string, message: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + orderId, message);
  } catch {
    // Depo kapalı (gizli pencere, engelli site verisi): not taşınmaz, sayfanın genel cümlesi kalır.
  }
}

/** Notu bir kez verir ve siler; sayfa yenilenince eski red yeniden gösterilmez. */
export function takePaymentError(orderId: string): string | null {
  try {
    const message = sessionStorage.getItem(KEY_PREFIX + orderId);
    sessionStorage.removeItem(KEY_PREFIX + orderId);
    return message;
  } catch {
    // Depo okunamadı: not yok sayılır, sayfanın genel cümlesi kalır.
    return null;
  }
}
