import { LOCALES, localizedPath, type AppRoute } from '@lezzet/i18n';

/** Dizine girmemesi gereken müşteri rotaları — kişiye özel, oturumlu ya da belirteçle açılan her şey. */
const PRIVATE_ROUTES: AppRoute[] = [
  '/cart',
  '/checkout',
  '/login',
  '/account',
  '/account/notifications',
  '/orders',
  '/support',
  '/feedback/[token]',
  // Davet kodu başkasının künyesidir: taranan bağ sahibinin adını arama sonucuna taşır.
  '/invite/[code]',
  '/neighbor/[token]',
];

/**
 * Özel rotaların üç dildeki önekleri — parametreli yolda yer tutucu atılır (`/fr/avis/[token]` → `/fr/avis`).
 * Tek liste: robots.txt ile `noindex` üstbilgisi aynı kararı okur.
 */
export const PRIVATE_PATH_PREFIXES: readonly string[] = [
  ...new Set(PRIVATE_ROUTES.flatMap((route) => LOCALES.map((locale) => `/${locale}${localizedPath(route, locale).replace(/\/\[[^\]]+\]$/, '')}`))),
].sort();

/** Yol özel bir rotanın kendisi ya da altı mı — segment sınırıyla, `/fr/commande` `/fr/commandes`i kapsamaz. */
export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
