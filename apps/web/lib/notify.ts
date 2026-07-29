import { brand } from '@lezzet/brand';
import { createNotifier, emailDriver, waLinkDriver, whatsappApiDriver } from '@lezzet/notify';
import { routing } from '@/i18n/routing';
import type { PreferredLanguage } from '@lezzet/types';

/**
 * Bildirim gönderiminin ORTAK zemini (14.4) — sürücü listesi, yasal alt bilgi, adres kurulumu.
 *
 * Sipariş ve talep bildirimleri ayrı dosyalarda yaşar (farklı veri, farklı olay) ama sürücü sırası
 * ve marka bilgisi ikisinde de aynıdır. Her biri kendi `createNotifier`'ını kursaydı yarın WhatsApp
 * API'si eklendiğinde sıralamayı iki yerde değiştirmek gerekirdi — ve biri unutulurdu.
 */

/** Yasal alt bilgi — mail her ülkede gönderenin adresini taşımak zorundadır. */
const POSTAL_ADDRESS = `${brand.name} · 12 Rue du Marché, 67000 Strasbourg, France`;

/**
 * Sürücü sırası TERCİH sırasıdır: e-posta önce denenir. WhatsApp API'si bağlanınca (modül 15) o
 * sürücünün `supports`'u dolar ve sıralama gözden geçirilir — çağıran taraf değişmez.
 */
export const notifier = createNotifier([
  emailDriver({ brandName: brand.name, postalAddress: POSTAL_ADDRESS }),
  waLinkDriver(),
  whatsappApiDriver(),
]);

/**
 * `routing.pathnames`'ten dile göre tam adres — **URL'in tek kaynağı o tablodur**, mail kendi
 * yolunu kurmaz. Kurabilseydi rota değiştiğinde maildeki bağlantı sessizce 404'e dönerdi.
 */
export function localizedUrl(
  route: keyof typeof routing.pathnames,
  locale: PreferredLanguage,
  params: Record<string, string> = {},
): string {
  const entry = routing.pathnames[route] as string | Record<PreferredLanguage, string>;
  const template = typeof entry === 'string' ? entry : entry[locale];
  const path = Object.entries(params).reduce((acc, [key, value]) => acc.replace(`[${key}]`, encodeURIComponent(value)), template);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lezzetanatolia.fr';
  return `${origin}/${locale}${path}`;
}
