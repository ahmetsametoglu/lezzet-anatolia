import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Müşteri yüzeyi locale yönlendirmesi. HARİÇ: operations (Türkçe yüzey, öneksiz),
  // auth (OAuth callback sabit URL), api, next iç yolları ve uzantılı dosyalar.
  matcher: ['/((?!api|_next|_vercel|operations|auth|.*\\..*).*)'],
};
