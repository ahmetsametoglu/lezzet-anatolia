import 'server-only';

import { isLocalHost, isLocalUrl } from '@lezzet/helper';

/**
 * Hızlı giriş kapısının kilidi ve hesapları tek yerde: rota ve giriş ekranındaki düğme şeridi aynı cevabı vermek zorunda, ayrı
 * yazılsalar biri ötekinden ayrılır. Kapının gerekçesi rotanın künyesinde.
 */

/**
 * Düğme şeridinin hesapları; sıra mobil kapının listesiyle aynıdır ki aynı düğme iki yüzeyde aynı hesabı açsın. Adresler
 * `scripts/seed/people.ts`in malıdır; web `scripts/`ten içe aktaramadığı için bu kopya bilinçli ve dardır.
 */
export const DEV_LOGIN_ACCOUNTS = [
  { label: 'Müşteri', email: 'claire.weber@example.fr', operations: false },
  { label: 'Yönetim', email: 'yonetim@lezzetanatolie.com', operations: true },
  { label: 'Depo', email: 'depo@lezzetanatolie.com', operations: true },
  { label: 'Kurye', email: 'kurye@lezzetanatolie.com', operations: true },
  { label: 'Muhasebe', email: 'muhasebe@lezzetanatolie.com', operations: true },
  { label: 'Hepsi', email: 'hepsi@lezzetanatolie.com', operations: true },
] as const;

/**
 * Kapı açık mı — üç kilit birden: açık beyan, sunucunun kendi adresinin yerel olması (istek başlığına bakmadığı için uydurulamaz)
 * ve isteğin yerel adrese gelmesi. `host`u çağıran çözer, çünkü rota `Request`e, ekran `headers()`e sahip.
 */
export function devLoginOpen(host: string): boolean {
  return process.env.DEV_LOGIN_ENABLED === 'true' && isLocalUrl(process.env.NEXT_PUBLIC_SITE_URL) && isLocalHost(host);
}
