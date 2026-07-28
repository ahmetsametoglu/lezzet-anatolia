import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { CheckoutClient } from './checkout-client';
import type { Messages } from './checkout-types';
import messages from './messages.json';

interface CheckoutPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Checkout sayfası (08.13).
 *
 * Sepet gibi, veriyi RSC'de OKUMAZ: sepetin kaynağı oturuma göre değişiyor ve ziyaretçininki
 * tarayıcıda yaşıyor. Sunucu burada yalnız **kimliği** çözer — girişli mi değil mi, ve girişliyse
 * fatura künyesi (Stripe'a elle geçecek ad/e-posta). Geri kalanı istemci action'larla çözer.
 *
 * Kimliğin sunucuda çözülmesi şart: "girişli miyim" sorusunu istemciye sordurmak, adım 0'ı
 * atlatmanın en kolay yolu olurdu.
 */
export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, user] = await Promise.all([detectDevice(), getSessionUser()]);
  const profile = user ? await new UserProfileService(serviceDb()).findByAuthUserId(user.id) : null;

  return (
    <SiteFrame device={device} locale={locale}>
      <CheckoutClient
        t={t}
        locale={locale}
        device={device}
        authenticated={profile !== null}
        customer={profile ? { name: profile.name, email: profile.email ?? user?.email ?? '', phone: profile.phone } : null}
      />
    </SiteFrame>
  );
}
