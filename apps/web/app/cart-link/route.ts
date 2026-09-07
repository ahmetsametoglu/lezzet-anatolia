import { NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { DEFAULT_LOCALE, type Locale } from '@lezzet/i18n';
import { routing } from '@/i18n/routing';
import { getPathname } from '@/i18n/navigation';
import { getSessionUser } from '@/lib/guard';
import { handOffCartLink } from '@/lib/identity/invite-handoff';
import { rememberCartLink } from '@/lib/identity/invite-cookie';

/**
 * **Sepet bağlantısının çerez kapısı** (15.21) — sepet sayfasının `?link=` ile devrettiği jeton.
 *
 * Route handler, çünkü çerez yalnız burada ya da server action'da yazılabilir; sepet sayfası bir
 * sunucu bileşeni ve yazamaz. Akış kısa: jeton çereze → oturum varsa hemen tüket ve sepete dön;
 * yoksa girişe götür (`next` sepet, `reason` sepet cümlesi) — giriş anında `invite-handoff` tüketir.
 *
 * **Jeton burada DOĞRULANMAZ** ve bilinçli: geçersiz bağlantıya da aynı yol yürünür (girişe ya da
 * sepete). Kapıda "bu bağlantı geçersiz" demek jetonun varlığını sızdırırdı (`claimCartLink`in
 * tek-cevap kararı); tüketim sonucu log'a düşer, ekran sepeti neyse onu gösterir.
 *
 * Origin `auth/callback` ile aynı sebeple başlıklardan kurulur: proxy arkasında `request.url`
 * yanlış köken taşır.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const origin = `${proto}://${host}`;

  const rawLocale = url.searchParams.get('locale');
  const locale: Locale = rawLocale && hasLocale(routing.locales, rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const cartPath = getPathname({ locale, href: '/cart' });

  const token = url.searchParams.get('token')?.trim() ?? '';
  if (!token) return NextResponse.redirect(`${origin}${cartPath}`);

  await rememberCartLink(token);

  const user = await getSessionUser();
  if (user) {
    await handOffCartLink(user.id, token);
    return NextResponse.redirect(`${origin}${cartPath}`);
  }

  const loginPath = getPathname({ locale, href: '/login' });
  return NextResponse.redirect(`${origin}${loginPath}?next=${encodeURIComponent(cartPath)}&reason=sepet`);
}
