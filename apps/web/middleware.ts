import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { OPERATIONS_PATH_HEADER, isOperationsPath } from './lib/operations-request';
import { refreshSession } from './lib/supabase/refresh';

const intlMiddleware = createMiddleware(routing);

/**
 * Üç iş, tek geçiş:
 * - **oturum tazeleme** (her iki yüzey) — çerez yazabilen tek yer burası; gerekçesi
 *   `lib/supabase/refresh.ts`'te. Bu olmadan bir saatlik jeton dolduğunda oturum sessizce çürüyor.
 * - müşteri → next-intl'in locale yönlendirmesi,
 * - operasyon → dizine kapatma + yolu layout'a taşıma. Yetki kontrolü burada DEĞİL: personel rolü
 *   `user_profiles`'tan service-role ile okunur (RLS deny-by-default) ve o anahtarın kenar
 *   paketine girmesi istenmez. Kapı bugün layout'ta (`(operations)/operations/layout.tsx`), tüm
 *   alt sayfaları kapsar. Kenarda oturum ön ELEMESİ hâlâ ayrı bir tur — `BACKLOG §2`; burada
 *   yapılan tazelemedir, karar değil.
 */
export default async function middleware(request: NextRequest) {
  // Önce tazele: dönen fonksiyon, hangi yanıtı üretirsek üretelim yeni çerezleri ona taşır.
  const applyAuthCookies = await refreshSession(request);

  const { pathname, search } = request.nextUrl;
  if (!isOperationsPath(pathname)) return applyAuthCookies(intlMiddleware(request));

  // Layout'un okuyacağı tek yol kaynağı — sorgu dizesiyle birlikte (operatör "imha geçmişi, bu
  // çeyrek" ekranından düştüyse giriş sonrası oraya döner, panele değil).
  const headers = new Headers(request.headers);
  headers.set(OPERATIONS_PATH_HEADER, `${pathname}${search}`);

  const response = applyAuthCookies(NextResponse.next({ request: { headers } }));
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
