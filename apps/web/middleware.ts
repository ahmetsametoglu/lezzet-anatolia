import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { cartLinkRedirect } from './lib/cart-link-redirect';
import { OPERATIONS_PATH_HEADER, isOperationsPath } from './lib/operations-request';
import { isPrivatePath } from './lib/seo/private-routes';
import { refreshSession } from './lib/supabase/refresh';

const intlMiddleware = createMiddleware(routing);

/**
 * Oturum tazeleme (çerez yazabilen tek yer), müşteride dil yönlendirmesi ve özel rotaları dizine
 * kapatma, operasyonda dizine kapatma ve yolu layout'a taşıma. Yetki kararı burada değil, layout'ta.
 */
export default async function middleware(request: NextRequest) {
  // Önce tazele: dönen fonksiyon, hangi yanıtı üretirsek üretelim yeni çerezleri ona taşır.
  const applyAuthCookies = await refreshSession(request);

  const { pathname, search } = request.nextUrl;

  // Sepet bağlantısı gerçek 307 ile çerez kapısına: sayfa içindeki akış-içi `redirect()` Router'ı düşürüyordu.
  const cartLink = cartLinkRedirect(request.nextUrl);
  if (cartLink) return applyAuthCookies(NextResponse.redirect(cartLink));

  if (!isOperationsPath(pathname)) {
    const response = applyAuthCookies(intlMiddleware(request));
    // robots.txt taramayı kapatır, dizine eklenmeyi değil: dışarıdan bağ alan özel adres ancak üstbilgiyle dışarıda kalır.
    if (isPrivatePath(pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  // Layout'un okuyacağı yol, sorgu dizesiyle: giriş sonrası operatör düştüğü ekrana döner.
  const headers = new Headers(request.headers);
  headers.set(OPERATIONS_PATH_HEADER, `${pathname}${search}`);

  const response = applyAuthCookies(NextResponse.next({ request: { headers } }));
  // Üstbilgi meta etiketinden farklı olarak yönlendirme, 404 ve gövdesiz yanıtlarda da taşınır.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  // `oauth` hariç: MCP uçlarının adresi keşif belgesinde yazılı, dil önekine yönlenirse jeton POST'u düşer.
  matcher: ['/((?!api|_next|_vercel|auth|oauth|.*\\..*).*)'],
};
