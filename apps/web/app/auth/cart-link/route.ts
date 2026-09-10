import { NextResponse } from 'next/server';
import { hasLocale } from 'next-intl';
import { DEFAULT_LOCALE, type Locale } from '@lezzet/i18n';
import { routing } from '@/i18n/routing';
import { getPathname } from '@/i18n/navigation';
import { getSessionUser } from '@/lib/guard';
import { handOffCartLink } from '@/lib/identity/invite-handoff';
import { rememberCartLink } from '@/lib/identity/invite-cookie';
import { cartLinkLanding, cartLinkPurposeOf } from '@/lib/identity/cart-link-landing';

/**
 * **Sohbet bağlantısının çerez kapısı** (15.21 · 15.16) — sepet ya da hesap sayfasının `?link=`
 * ile devrettiği jeton.
 *
 * Route handler, çünkü çerez yalnız burada ya da server action'da yazılabilir; sepet sayfası bir
 * sunucu bileşeni ve yazamaz. Akış kısa: jeton çereze → oturum varsa hemen tüket ve hedefe dön;
 * yoksa girişe götür (`next` hedef, `reason` amacın cümlesi) — giriş anında `invite-handoff` tüketir.
 *
 * **İki amaç, tek kapı (08.09):** `?to=hesap` sepetsiz sohbeti hesaba bağlama bağlantısıdır —
 * hedef hesap sayfası, giriş cümlesi "sohbetinizi bağlamak için". Karar saf ve testli
 * (`cart-link-landing.ts`); amaç ADRESTEN okunur — hesap bağlantısı hesap sayfasına üretilir ve
 * sayfa `to=hesap` ekler. Jetonun satırındaki amaç (`cart_link.purpose`) burada okunmaz: kapı jetonu
 * doğrulamaz (aşağıdaki not).
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
  const accountPath = getPathname({ locale, href: '/account' });
  const loginPath = getPathname({ locale, href: '/login' });
  const purpose = cartLinkPurposeOf(url.searchParams.get('to'));

  const token = url.searchParams.get('token')?.trim() ?? '';
  if (!token) return NextResponse.redirect(`${origin}${purpose === 'account' ? accountPath : cartPath}`);

  await rememberCartLink(token);

  const user = await getSessionUser();
  if (user) await handOffCartLink(user.id, token);

  return NextResponse.redirect(`${origin}${cartLinkLanding({ purpose, signedIn: user !== null, cartPath, accountPath, loginPath })}`);
}
