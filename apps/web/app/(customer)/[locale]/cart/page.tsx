import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CART_LINK_PARAM } from '@lezzet/application/cart/link';
import { detectDevice } from '@/lib/device';
import { getEmptyCartContext, type EmptyCartContext } from '@/lib/cart/empty-cart';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { CartClient } from './cart-client';
import type { Messages } from './cart-types';
import messages from './messages.json';

/** Önerisiz boş sepet: telefon çatalı boş sepeti kendi kartıyla çizer ve bağlamı okumaz. */
const NO_SUGGESTIONS: EmptyCartContext = { lastOrder: null, categories: [], showcase: [], illustration: null };

interface CartPageProps {
  params: Promise<{ locale: string }>;
  /** `?link=<jeton>` — sohbetten gelen sepet bağlantısı; sayfa onu çerez kapısına devreder. */
  searchParams: Promise<{ [CART_LINK_PARAM]?: string }>;
}

/**
 * Sepet verisi RSC'de okunmaz: ziyaretçinin sepeti tarayıcıda yaşıyor ve sunucu onu göremez. Okuma
 * istemcide `CartProvider` üzerinden yapılır; sayfa yalnız çerçeveyi ve metni verir.
 */
export default async function CartPage({ params, searchParams }: CartPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  /* Jeton burada tüketilemez: sunucu bileşeni çerez yazamaz ve oturum yoksa önce giriş gerekir. Kapı
     `/auth/` altında, çünkü dil ara katmanı `auth` dışındaki her yola dil öneki ekliyor. */
  const { [CART_LINK_PARAM]: linkToken } = await searchParams;
  if (linkToken) redirect(`/auth/cart-link?token=${encodeURIComponent(linkToken)}&locale=${locale}`);

  void recordPageView('/cart');

  const t: Messages = messages[locale];
  const device = await detectDevice();
  // Bağlam yalnız masaüstü çatalının boş sepetine gider; telefonda beklemek dolu sepeti de geciktirirdi.
  const emptyContext = device === 'mobile' ? NO_SUGGESTIONS : await getEmptyCartContext(locale);

  return (
    // Mobilde çıplak kabuk: tasarımın karesi logosuz tek satır çiziyor, o satırı sayfa kurar.
    <SiteFrame device={device} locale={locale} mobileChrome="bare" footer="slim">
      <CartClient t={t} locale={locale} device={device} emptyContext={emptyContext} />
    </SiteFrame>
  );
}
