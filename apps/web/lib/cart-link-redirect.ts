import { CART_LINK_PARAM, LOCALES, localizedPath, type Locale } from '@lezzet/i18n';

/**
 * Sohbetten gelen sepet bağlantısını (`/fr/panier?link=…`) çerez kapısına (`/auth/cart-link`) çeviren
 * KARAR — ara katman çağırır, gerçek bir HTTP 307 döner. Saf: `URL` alır, `URL` ya da `null` verir.
 *
 * ── NEDEN SAYFADAKİ `redirect()` YETMEDİ (08.09, canlıda ölçüldü) ────────────
 * Sepet sayfası jetonu görünce `redirect()` çağırıyor; sayfanın `loading.tsx`i olduğu için bu
 * yönlendirme AKIŞ İÇİ gidiyor (önce iskelet, sonra RSC yükünde yönlendirme) ve Next 15.5'in kendi
 * `Router` bileşeni bu geçişte *"Rendered more hooks than during the previous render"* ile çöküyor
 * (dev'de açık metin, üretim kopyasında React #310 — ikisi de Playwright ile yakalandı; yığın
 * tamamen `app-router.js`, bizim bileşen yok). Müşteri Messenger'daki bağlantıya dokununca
 * "Application error" görüyordu. Ara katman hiç render etmeden yönlendirir; akış yok, kusur yok.
 * Sayfadaki `redirect()` duruyor: ara katmanın kapsamadığı bir yoldan gelirse ikinci emniyet.
 *
 * Yol eşlemesi `@lezzet/i18n`den (`localizedPath('/cart')`): üç dilin sepet kelimesi orada, burada
 * ikinci bir liste yok. Facebook'un eklediği `fbclid` gibi fazladan parametreler yok sayılır.
 */
export function cartLinkRedirect(url: URL): URL | null {
  const token = url.searchParams.get(CART_LINK_PARAM)?.trim();
  if (!token) return null;

  const [, first, ...rest] = url.pathname.replace(/\/+$/, '').split('/');
  if (!first || !(LOCALES as readonly string[]).includes(first)) return null;
  const locale = first as Locale;
  if (`/${rest.join('/')}` !== localizedPath('/cart', locale)) return null;

  const target = new URL('/auth/cart-link', url.origin);
  target.searchParams.set('token', token);
  target.searchParams.set('locale', locale);
  return target;
}
