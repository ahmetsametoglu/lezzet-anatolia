import { defaultNotifier } from '@lezzet/notify';

/**
 * Bildirim gönderiminin ORTAK zemini (14.4).
 *
 * Sürücü listesi ve yasal alt bilgi artık `@lezzet/notify`'da (`defaultNotifier`) — çünkü aynı
 * kurulumu `apps/backend` de kuruyor (17.2 davet gönderimi). İki uygulamanın kendi listesini
 * taşıması, WhatsApp API'si bağlandığında (modül 15) sıralamayı iki yerde değiştirmek demekti; biri
 * unutulurdu ve iki yüzey aynı olayı farklı kanaldan yollardı.
 *
 * Burada kalan tek şey bu yüzeyin kısayolu: sipariş ve talep dosyaları `notifier`'ı buradan alır.
 */
export const notifier = defaultNotifier();

// Adres kurucusu (`localizedUrl`) `@lezzet/i18n`'e taşındı — yol tablosuyla aynı yerde durması
// gerekiyordu ve backend de aynı kurucuyu kullanıyor. Çağıranlar doğrudan oradan alır.
export { localizedUrl } from '@lezzet/i18n';
