import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { CART_LINK_PARAM } from '@lezzet/application/cart/link';
import { detectDevice } from '@/lib/device';
import { getEmptyCartContext } from '@/lib/cart/empty-cart';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { CartClient } from './cart-client';
import type { Messages } from './cart-types';
import messages from './messages.json';

interface CartPageProps {
  params: Promise<{ locale: string }>;
  /** `?link=<jeton>` — sohbetten gelen sepet bağlantısı (15.21); sayfa onu çerez kapısına devreder. */
  searchParams: Promise<{ [CART_LINK_PARAM]?: string }>;
}

/**
 * Sepet sayfası (08.4).
 *
 * Diğer vitrin sayfalarının aksine veriyi RSC'de OKUMAZ: sepetin kaynağı oturuma göre değişiyor —
 * ziyaretçininki tarayıcıda yaşıyor ve sunucu onu göremiyor. Bu yüzden okuma istemcide, kök
 * `CartProvider` üzerinden yapılır; sayfa yalnız çerçeveyi ve metni verir.
 *
 * Girişli müşteride sunucu sepeti kazanır (action oturuma bakar) — yani ayrım bir performans
 * ödünü değil, doğruluk gereği.
 */
export default async function CartPage({ params, searchParams }: CartPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  /* SOHBETTEN GELEN BAĞLANTI (15.21): ajanın gönderdiği adres bu sayfadır (`/fr/panier?link=…`)
     ki müşteri okunaklı bir bağlantı görsün. Ama jeton burada TÜKETİLEMEZ — sunucu bileşeni çerez
     yazamaz ve oturum yoksa önce giriş gerekir. Sayfa jetonu çerez kapısına devreder
     (`/auth/cart-link`): oturum varsa orada tüketilir ve buraya dönülür, yoksa giriş sayfasına
     gidilir ve giriş anında tüketilir (`invite-handoff`). Sayfa görüntülemesi de o dönüşte sayılır.
     Kapı `/auth/` altında ve bilerek: dil ara katmanı `auth` dışındaki her yolu dil önekine
     çeviriyor — `/cart-link` 3001'de `/fr/cart-link` olup 404 düştü (ölçüldü 07.09, e2e). */
  const { [CART_LINK_PARAM]: linkToken } = await searchParams;
  if (linkToken) redirect(`/auth/cart-link?token=${encodeURIComponent(linkToken)}&locale=${locale}`);

  void recordPageView('/cart');

  const t: Messages = messages[locale];
  const [device, emptyContext] = await Promise.all([detectDevice(), getEmptyCartContext(locale)]);

  return (
    // Huni sayfası ÇIPLAK kabukta (kullanıcı kararı 20.08, ikinci tur): önce detay katmanı
    // denendi (geri + logo barı) ama üst bölge iki katlı ve dengesiz göründü — tasarımın kendi
    // karesi zaten logosuz TEK satır çiziyor ("← Devam et · Sepetim · 6 ürün"). O satırı sayfa
    // kurar (`cart.mobile`); çerçeve başlık da footer da çizmez.
    <SiteFrame device={device} locale={locale} mobileChrome="bare" footer="none">
      <CartClient t={t} locale={locale} device={device} emptyContext={emptyContext} />
    </SiteFrame>
  );
}
