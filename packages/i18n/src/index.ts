// @lezzet/i18n — dil birimleri (locale union) + ortak yerelleştirme sabitleri + URL yol tablosu.
// Arayüz metinleri her sayfanın kendi colocated JSON'unda; burada yalnız locale tanımı.
// Tarayıcı dili tespiti ve next-intl yönlendirmesi apps/web'de; yol TABLOSU `paths.ts`te (26.08 —
// `app.config.ts` Metro'dan önce Node ESM'le okur ve girişin uzantısız yeniden-ihraçlarını
// çözemez; gerekçenin tamamı `paths.ts` künyesinde. Metro/TS tüketicileri için değişen yok:
// index yeniden yayımlar).
export const PACKAGE = '@lezzet/i18n' as const;

// Dil birimleri kendi modülünde (`locale.ts` künyesi: `notification-copy` ile döngü olmasın);
// buradan yeniden yayımlanır — tüketiciler için hiçbir şey değişmez.
import type { Locale } from './locale';
import { localizedPath, type AppRoute } from './paths';

export { DEFAULT_LOCALE, LOCALES } from './locale';
export type { Locale } from './locale';

export { PATHNAMES, localizedPath } from './paths';
export type { AppRoute } from './paths';

/**
 * Locale-anahtarlı bir metin nesnesinden ({tr,fr,de:{…}}) seçili dilin şeklini verir.
 * Sayfa metin tiplerini `messages.json`'dan türetmek için: `type M = LocalizedCopy<typeof messages>`.
 * Diller özdeş varsayılır; değilse `[Locale]` birleşimi paritesizliği tipçe yüzeye çıkarır.
 */
export type LocalizedCopy<T extends Record<Locale, unknown>> = T[Locale];

/**
 * Sitenin dış dünyaya görünen KÖKENİ — mail bağlantısı, site haritası ve mutlak adreslerin ortak
 * başlangıcı.
 *
 * Ortamdan gelir; yereldeki geliştirme sunucusu da üretimdeki alan adı da aynı çağrıyı kullanır.
 * Varsayılan üretim alan adıdır: kökeni okuyamayan bir gönderim, bağlantısız bir mail yollamaktansa
 * doğru adrese yollamayı denemelidir.
 *
 * Ayrı bir fonksiyon (08.1): site haritası da aynı kökeni istiyor ama tam bir rota adresi değil,
 * yalnız başlangıcı. İkinci bir yerde `?? 'https://…'` yazmak, iki varsayılanın bir gün ayrışması
 * ve mailin gösterdiği adresle haritanın verdiği adresin farklı olması demekti.
 */
export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lezzetanatolia.fr';
}

/** Dış dünyaya verilecek TAM adres (mail, WhatsApp, paylaşılan bağlantı) — dil öneki dâhil. */
export function localizedUrl(route: AppRoute, locale: Locale, params: Record<string, string> = {}): string {
  return `${siteOrigin()}/${locale}${localizedPath(route, locale, params)}`;
}

// Bildirim cümle + görsel kimlik sözlüğü — iki yüzeyin (native + web) ortak dili; gerekçe dosyada.
export {
  notificationSentence,
  notificationVisual,
  staffNotificationBrief,
  type NotificationVisual,
  type NotificationVisualTone,
  type StaffNotificationBrief,
  type StaffNotificationTone,
} from './notification-copy';
