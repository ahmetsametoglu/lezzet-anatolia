import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { recordEvent } from '@/lib/analytics/record';
import { CheckoutClient } from './checkout-client';
import type { Messages } from './checkout-types';
import messages from './messages.json';

interface CheckoutPageProps {
  params: Promise<{ locale: string }>;
  /**
   * `?group=shipping` — sepetin kargo grubundan açılan ikinci sipariş. URL'de taşınır ki yenileme ve
   * geri dönüş aynı siparişi açsın; bayrak yetki değil seçimdir, taslak kendi kontrollerini yapar.
   */
  searchParams: Promise<{ group?: string }>;
}

/**
 * Sepet gibi veriyi RSC'de okumaz; sunucu yalnız kimliği ve fatura künyesini çözer. Kimliğin sunucuda
 * çözülmesi şart: "girişli miyim" sorusunu istemciye sordurmak kapıyı atlatmanın en kolay yolu olurdu.
 */
export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const [{ locale }, { group }] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, user] = await Promise.all([detectDevice(), getSessionUser()]);
  const profile = user ? await new UserProfileService(serviceDb()).findByAuthUserId(user.id) : null;
  if (!profile) return redirect({ href: '/cart', locale });

  /**
   * Huni adımı eylemden değil sayfadan atılır: `loadCheckoutAction` adres her değiştiğinde yeniden
   * çağrılıyor, oradan atılsa adım sayısı şişerdi.
   */
  void recordEvent({ type: 'checkout_start' }, { path: '/checkout' });

  return (
    // Mobilde çıplak kabuk: tasarımın karesi logosuz, geri bağını sayfa kurar (`checkout.mobile`).
    <SiteFrame device={device} locale={locale} mobileChrome="bare" footer="none">
      <CheckoutClient
        t={t}
        locale={locale}
        device={device}
        shippingOrder={group === 'shipping'}
        customer={{ name: profile.name, email: profile.email ?? user?.email ?? '', phone: profile.phone }}
      />
    </SiteFrame>
  );
}
