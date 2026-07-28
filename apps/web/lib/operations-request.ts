/**
 * Middleware ↔ operasyon layout'u arasındaki tek sözleşme.
 *
 * Next.js sunucu bileşenine "hangi yoldayız" bilgisini VERMEZ (layout `pathname` göremez). Girişi
 * olmayan operatörü giriş sonrası GELDİĞİ ekrana döndürebilmek için yolu taşıyan tek yer bu
 * üstbilgidir; adı iki tarafta ayrı yazılsaydı sessizce eşleşmez ve `next` daima `/operations`
 * kalırdı — hata görünmez, sonucu "her girişte panele düşmek" olurdu.
 */
export const OPERATIONS_PATH_HEADER = 'x-operations-path';

/** Operasyon yüzeyi öneksizdir (Türkçe, tek dil) — locale yönlendirmesinin dışında kalır. */
export const OPERATIONS_PREFIX = '/operations';

export function isOperationsPath(pathname: string): boolean {
  return pathname === OPERATIONS_PREFIX || pathname.startsWith(`${OPERATIONS_PREFIX}/`);
}
