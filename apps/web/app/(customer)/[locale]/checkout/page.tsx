import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { detectDevice } from '@/lib/device';
import { getSessionUser } from '@/lib/guard';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { recordEvent } from '@/lib/analytics/record';
import { CheckoutClient } from './checkout-client';
import type { Messages } from './checkout-types';
import messages from './messages.json';

interface CheckoutPageProps {
  params: Promise<{ locale: string }>;
  /**
   * `?group=shipping` — sepetin KARGO grubundan açılan ikinci sipariş (19.7).
   *
   * URL'de taşınması bilinçli: müşteri geri gelebilmeli, sayfayı yenileyebilmeli ve hangi siparişi
   * verdiğini adres çubuğunda görebilmeli. Bir bellek durumunda tutulsaydı yenileme sessizce rota
   * checkout'una düşerdi — üstelik kargo grubunun kalemleriyle.
   *
   * Bayrak bir YETKİ değil, bir seçim: uydurulmuş bir değerin yapabileceği tek şey kendi sepetinin
   * kargo kalemlerini sipariş etmek. Taslak zaten kendi kontrollerini yapıyor (kargo deposu var mı,
   * soğuk zincir kalemi var mı, kalemler o depoda mı).
   */
  searchParams: Promise<{ group?: string }>;
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
export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const [{ locale }, { group }] = await Promise.all([params, searchParams]);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, user] = await Promise.all([detectDevice(), getSessionUser()]);
  const profile = user ? await new UserProfileService(serviceDb()).findByAuthUserId(user.id) : null;

  /**
   * Huninin dördüncü adımı (08.9). **`loadCheckoutAction`'dan DEĞİL sayfadan atılıyor:** o eylem
   * adres her değiştiğinde yeniden çağrılıyor ve oradan atsaydık huninin ikinci adımı birincisinden
   * büyük çıkardı. Sayfa render'ı ise checkout'a girişin kendisidir — ziyaret başına bir kez.
   */
  void recordEvent({ type: 'checkout_start' }, { path: '/checkout' });

  return (
    <SiteFrame device={device} locale={locale}>
      <CheckoutClient
        t={t}
        locale={locale}
        device={device}
        shippingOrder={group === 'shipping'}
        authenticated={profile !== null}
        customer={profile ? { name: profile.name, email: profile.email ?? user?.email ?? '', phone: profile.phone } : null}
      />
    </SiteFrame>
  );
}
