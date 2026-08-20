import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { listCustomerOrders } from '@/lib/order/customer-orders';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { OrdersClient } from './orders-client';
import type { Messages } from './orders-types';
import messages from './messages.json';

/**
 * Siparişlerim (08.5) — müşteri döngüsünün son açık ucu: sipariş veriliyor, maille onaylanıyor ama
 * sonra hiçbir yerden bakılamıyordu. Sipariş onay sayfasındaki "sipariş takip" düğmesi ile onay
 * mailindeki bağ da buraya (ve detayına) çıkıyor.
 *
 * **Girişsiz ziyaretçi 404 GÖRMEZ, girişe yönlenir** — hesap sayfasıyla aynı gerekçe: sayfanın
 * kendisi bir sır değil, müşterinin eksiği kimlik.
 *
 * İlk sayfa SUNUCUDA çözülür; devamı istemciden imleçle gelir. İmleç URL'e yazılmaz (CLAUDE.md §1):
 * burada paylaşılabilecek bir süzgeç seçimi yok, liste yalnız uzuyor.
 */
interface OrdersPageProps {
  params: Promise<{ locale: string }>;
}

export default async function OrdersPage({ params }: OrdersPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/orders');

  const t: Messages = messages[locale];
  const [device, customerId] = await Promise.all([detectDevice(), currentCustomerId()]);
  // Segment tablosu yolu BAŞINDA bölü ile taşıyor (`/giris`); ikinci bir bölü eklenmez.
  if (!customerId) redirect(`/${locale}${LOGIN_SEGMENT[locale]}`);

  const first = await listCustomerOrders(locale as Locale, customerId);

  return (
    <SiteFrame
      device={device}
      locale={locale}
      // Geri bağı HESABA (tasarım: "← Hesabım | Siparişlerim") — destek sayfasıyla aynı desen;
      // sağdaki "← Kataloğa dön" 20.08'de düştü: satırda iki ok'lu bağ kafa karıştırıyordu ve
      // kataloğun yolu zaten menüde + boş hâlin kendi CTA'sında.
      accountChrome={{ nav: 'orders', back: { label: t.backToAccount, href: '/account' }, title: t.title }}
    >
      <OrdersClient t={t} locale={locale as Locale} first={first} device={device} />
    </SiteFrame>
  );
}

/** Giriş sayfasının dile göre segmenti — hesap sayfasıyla aynı gerekçe, tablodan okunur. */
const LOGIN_SEGMENT = routing.pathnames['/login'];
