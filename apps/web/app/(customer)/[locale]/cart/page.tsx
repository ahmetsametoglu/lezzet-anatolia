import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { detectDevice } from '@/lib/device';
import { getEmptyCartContext } from '@/lib/cart/empty-cart';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { CartClient } from './cart-client';
import type { Messages } from './cart-types';
import messages from './messages.json';

interface CartPageProps {
  params: Promise<{ locale: string }>;
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
export default async function CartPage({ params }: CartPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, emptyContext] = await Promise.all([detectDevice(), getEmptyCartContext(locale)]);

  return (
    <SiteFrame device={device} locale={locale}>
      <CartClient t={t} locale={locale} device={device} emptyContext={emptyContext} />
    </SiteFrame>
  );
}
