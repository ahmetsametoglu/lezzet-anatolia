import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getAccountView } from '@/lib/account/read';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
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
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, customerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  // Segment tablosu yolu BAŞINDA bölü ile taşıyor (`/giris`); ikinci bir bölü eklenmez.
  if (!customerId) redirect(`/${locale}${LOGIN_SEGMENT[locale]}`);

  const account = await getAccountView(locale as Locale, customerId);
  if (!account) notFound();

  return (
    <SiteFrame device={device} locale={locale}>
      <AccountClient t={t} locale={locale} account={account} device={device} />
    </SiteFrame>
  );
}

/**
 * Giriş sayfasının dile göre segmenti. `redirect` sunucuda çalışıyor ve `@/i18n/navigation`'ın
 * `redirect`i burada kullanılamıyor (rota şablonu değil, doğrudan adres gerekiyor); eşleme
 * `routing.ts`'in kendi tablosundan KOPYALANMAZ, oradan okunur.
 */
const LOGIN_SEGMENT = routing.pathnames['/login'];
