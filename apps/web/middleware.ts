import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { OPERATIONS_PATH_HEADER, isOperationsPath } from './lib/operations-request';

const intlMiddleware = createMiddleware(routing);

/**
 * İki yüzey, iki iş:
 * - müşteri → next-intl'in locale yönlendirmesi (eskiden bu dosyanın TEK işiydi),
 * - operasyon → dizine kapatma + yolu layout'a taşıma. Yetki kontrolü burada DEĞİL: personel rolü
 *   `user_profiles`'tan service-role ile okunur (RLS deny-by-default) ve o anahtarın kenar
 *   paketine girmesi istenmez. Kapı bugün layout'ta (`(operations)/operations/layout.tsx`), tüm
 *   alt sayfaları kapsar. Kenarda oturum ön elemesi ayrı bir tur — `BACKLOG §2`.
 */
export default function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isOperationsPath(pathname)) return intlMiddleware(request);

  // Layout'un okuyacağı tek yol kaynağı — sorgu dizesiyle birlikte (operatör "imha geçmişi, bu
  // çeyrek" ekranından düştüyse giriş sonrası oraya döner, panele değil).
  const headers = new Headers(request.headers);
  headers.set(OPERATIONS_PATH_HEADER, `${pathname}${search}`);

  const response = NextResponse.next({ request: { headers } });
  // Gövdedeki `robots` meta etiketinden FARKLI olarak üstbilgi her yanıtta taşınır: yönlendirme,
  // 404, hata ve gövdesiz yanıtlar dahil. İkisi birlikte, dizine düşebilecek tek yanıt bırakmaz.
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  // Müşteri yüzeyi locale yönlendirmesi + operasyon üstbilgileri. HARİÇ: api, auth (OAuth callback
  // sabit URL), next iç yolları ve uzantılı dosyalar.
  matcher: ['/((?!api|_next|_vercel|auth|.*\\..*).*)'],
};
