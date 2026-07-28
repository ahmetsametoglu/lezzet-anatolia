import { isOperationsPath, OPERATIONS_PREFIX } from '@/lib/operations-request';

/**
 * Açık yönlendirme (open redirect) koruması: yalnız site-içi mutlak yol kabul edilir.
 * `//host` ve `http…` gibi dış hedefler reddedilir; varsayılan '/'.
 */
function safeNext(next: string | null | undefined): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

/**
 * Giriş sonrası hedefin KARARI — DB'siz, saf, testli. "Personel mi" sorusunu soran sarıcı ayrı
 * (`resolvePostLoginRedirect`); burada yalnız iki yüzey kuralı yaşar.
 *
 * `next` her iki yüzeyde de yüzeye göre SÜZÜLÜR — süzülmezse yönlendirme kendi kuralını deler:
 * personel operasyon yolundan geldiyse oraya döner (eskiden koşulsuz panele düşerdi: "stok
 * ekranına tıkladım, girişten sonra kendimi panelde buldum"), müşteri ise operasyon yoluna
 * taşınmaz (girer girmez "bu alan personel içindir" ekranına çarpardı).
 */
export function postLoginTarget(isStaff: boolean, next?: string | null): string {
  const target = safeNext(next);
  if (isStaff) return isOperationsPath(target) ? target : OPERATIONS_PREFIX;
  return isOperationsPath(target) ? '/' : target;
}
