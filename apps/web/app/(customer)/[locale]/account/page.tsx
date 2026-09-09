import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CART_LINK_PARAM, type Locale } from '@lezzet/i18n';
import { readChatLinkNotice } from '@/lib/identity/invite-cookie';
import { CART_LINK_TO_ACCOUNT, parseChatLinkNotice } from '@/lib/identity/cart-link-landing';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getAccountView } from '@/lib/account/read';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { SignOutLink } from '@/components/customer/account/sign-out-link';
import { AccountClient } from './account-client';
import type { Messages } from './account-types';
import messages from './messages.json';

/**
 * Hesabım (08.5) — müşteri döngüsünün kapanmayan ucuydu: sipariş veriliyor, sonra siparişe
 * bakılamıyordu.
 *
 * **Girişsiz ziyaretçi 404 GÖRMEZ, girişe yönlenir.** Sayfanın kendisi bir sır değil; müşterinin
 * eksiği kimlik. 404 "böyle bir sayfa yok" der ve yanlıştır.
 *
 * Kanal (B2C/B2B) SAKLANMAZ, şirket künyesinden türer: B2C'de şirket bölümü, B2B'de puan/kupon
 * bölümü DOM'da hiç yoktur (tasarımın kuralı) — gri gösterilmez, hiç doğmaz.
 */
interface AccountPageProps {
  params: Promise<{ locale: string }>;
  /** `?link=<jeton>` — sohbetten gelen HESAP bağlantısı (15.16); sayfa onu çerez kapısına devreder. */
  searchParams: Promise<{ [CART_LINK_PARAM]?: string }>;
}

export default async function AccountPage({ params, searchParams }: AccountPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  /* SOHBETTEN GELEN BAĞLANTI (15.16, kullanıcı tasarımı 08.09): sepetsiz sohbeti hesaba bağlayan
     bağlantı bu sayfaya düşer (`/fr/compte?link=…`). Jetonu çerez kapısına devrederiz
     (`/auth/cart-link?to=hesap`): oturum varsa orada tüketilir ve buraya dönülür, yoksa giriş
     sayfasına — cümlesi "sohbetinizi bağlamak için". Sepet sayfasıyla aynı desen; bu sayfanın
     `loading.tsx`i olmadığı için yönlendirme akış-içi tuzağa düşmüyor (`cart-link-redirect.ts` künyesi). */
  const { [CART_LINK_PARAM]: linkToken } = await searchParams;
  if (linkToken) redirect(`/auth/cart-link?token=${encodeURIComponent(linkToken)}&locale=${locale}&to=${CART_LINK_TO_ACCOUNT}`);

  void recordPageView('/account');

  const t: Messages = messages[locale];
  const [device, customerId, rawNotice] = await Promise.all([detectDevice(), currentCustomerId(), readChatLinkNotice()]);
  // Segment tablosu yolu BAŞINDA bölü ile taşıyor (`/giris`); ikinci bir bölü eklenmez.
  if (!customerId) redirect(`/${locale}${LOGIN_SEGMENT[locale]}`);

  const account = await getAccountView(locale as Locale, customerId);
  if (!account) notFound();

  return (
    <SiteFrame device={device} locale={locale} accountChrome={{ nav: 'account', title: t.title, right: <SignOutLink locale={locale as Locale} /> }}>
      <AccountClient t={t} locale={locale} account={account} device={device} chatNotice={parseChatLinkNotice(rawNotice)} />
    </SiteFrame>
  );
}

/**
 * Giriş sayfasının dile göre segmenti. `redirect` sunucuda çalışıyor ve `@/i18n/navigation`'ın
 * `redirect`i burada kullanılamıyor (rota şablonu değil, doğrudan adres gerekiyor); eşleme
 * `routing.ts`'in kendi tablosundan KOPYALANMAZ, oradan okunur.
 */
const LOGIN_SEGMENT = routing.pathnames['/login'];
