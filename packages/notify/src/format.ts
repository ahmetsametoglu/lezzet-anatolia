import type { PreferredLanguage } from '@lezzet/types';

/**
 * GİDEN MESAJIN biçimlemesi — üçüncü yüzey (STACK §10).
 *
 * Kural "biçimleme yüzey başına tek dosya" diyor ve iki yüzey sayıyordu: müşteri ekranları,
 * operasyon ekranları. Mail ve WhatsApp üçüncüsüdür ve gerçekten ayrıdır: ekran biçimlemesi
 * `apps/web`'de yaşıyor, oysa giden mesajı iki uygulama da kuruyor — istekten doğanı `apps/web`,
 * saatten doğanı `apps/backend`. Zamanlı işin ekran katmanından biçimleyici çekmesi bağımlılık
 * yönünü tersine çevirirdi; kendi `Intl` çağrısını yazması ise aynı tarihin iki mailde iki türlü
 * çıkması demekti.
 */

const INTL_LOCALE: Record<PreferredLanguage, string> = { tr: 'tr-TR', fr: 'fr-FR', de: 'de-DE' };

/**
 * Mesajdaki gün ("22 Temmuz 2026" · "22 juillet 2026" · "22. Juli 2026").
 *
 * **Yıl yazılır.** Ekranda yılsız tarih meşrudur (müşteri az önceki siparişine bakar), ama mail
 * arşivde kalır ve aylar sonra açılır; yılsız "22 Temmuz" o an hangi yıl olduğunu söylemez.
 */
export function formatMessageDate(iso: string, locale: PreferredLanguage): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}
