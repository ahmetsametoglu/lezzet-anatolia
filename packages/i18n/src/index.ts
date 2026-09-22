// @lezzet/i18n — dil birimleri, ortak yerelleştirme sabitleri ve URL yol tablosu; arayüz metinleri her sayfanın kendi JSON'unda.
// Yol tablosu `paths.ts`te: `app.config.ts` onu Node ESM'le okuyor ve girişin uzantısız yeniden ihraçlarını çözemiyor.
export const PACKAGE = '@lezzet/i18n' as const;

// Dil birimleri kendi modülünde: `notification-copy` ile döngü olmasın.
import type { Locale } from './locale';
import { localizedHref, type AppRoute } from './paths';

export { DEFAULT_LOCALE, INTL_LOCALE, LOCALES } from './locale';
export type { Locale } from './locale';

export { CART_LINK_PARAM, PATHNAMES, localizedHref, localizedPath } from './paths';
export type { AppRoute } from './paths';

export { copyForSurface, type Surface, type SurfaceCopy } from './surface-copy';

/**
 * Locale-anahtarlı metin nesnesinden seçili dilin şekli: `type M = LocalizedCopy<typeof messages>`. Diller özdeş
 * değilse `[Locale]` birleşimi paritesizliği tipçe yüzeye çıkarır.
 */
export type LocalizedCopy<T extends Record<Locale, unknown>> = T[Locale];

/**
 * Sitenin dış dünyaya görünen kökeni — mail bağlantısı, site haritası ve mutlak adreslerin ortak başlangıcı. Varsayılan
 * üretim alan adıdır: kökeni okuyamayan gönderim bağlantısız mail yollamaktansa doğru adresi denesin.
 */
export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lezzetanatolie.com';
}

/** Dış dünyaya verilecek tam adres (mail, WhatsApp, paylaşılan bağlantı) — dil öneki dâhil. */
export function localizedUrl(route: AppRoute, locale: Locale, params: Record<string, string> = {}): string {
  return `${siteOrigin()}${localizedHref(route, locale, params)}`;
}

// Bildirim başlığı, cümlesi ve görsel kimliği — iki yüzeyin (native + web) ortak dili.
export {
  notificationTitle,
  notificationSentence,
  notificationVisual,
  staffNotificationBrief,
  type NotificationVisual,
  type NotificationVisualTone,
  type StaffNotificationBrief,
  type StaffNotificationTone,
} from './notification-copy';
