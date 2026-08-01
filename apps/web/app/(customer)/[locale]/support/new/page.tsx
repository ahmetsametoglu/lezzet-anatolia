import { notFound, redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { currentCustomerId } from '@/lib/guard';
import { getCustomerOrderDetail, listCustomerOrders } from '@/lib/order/customer-orders';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { NewTicketForm } from './new-ticket-form';
import type { Messages } from '../support-types';
import messages from '../messages.json';

/**
 * Talep açma (08.6) — iki yoldan gelinir ve ekran o yola göre AÇILIR:
 *
 * - **Siparişten** (`?order=…`): sipariş detayındaki "Sorun bildir". Kalemler hazır listelenir,
 *   müşteri işaretler. Başlık siparişin numarasına geri döner.
 * - **Genel** ("+ Bize yazın"): önce tek soru — "bir siparişle mi ilgili?". Evetse sipariş seçtirilir
 *   ve aynı akışa bağlanır, hayırsa doğrudan serbest mesaj. Amaç tasarımın kendi cümlesi: müşteriyi
 *   düşündürmeden doğru yola sokmak.
 *
 * **Cihaz çatalı YOK ve bu tasarımın kararı** (etkileşim sözleşmesi: "web biçimi → aynı akış, 560px
 * ortalanmış tek sütun"). Fark yalnız sütunun genişliği; iki ayrı görünüm dosyası yazmak aynı formu
 * iki kez bakımda tutmak olurdu.
 */
interface NewTicketPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ order?: string }>;
}

export default async function NewTicketPage({ params, searchParams }: NewTicketPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const { order: orderId } = await searchParams;
  const t: Messages = messages[locale];

  const customerId = await currentCustomerId();
  // Segment tablosu yolu BAŞINDA bölü ile taşıyor; ikinci bir bölü eklenmez.
  if (!customerId) redirect(`/${locale}${routing.pathnames['/login'][locale]}`);

  const [device, order, orders] = await Promise.all([
    detectDevice(),
    orderId ? getCustomerOrderDetail(locale as Locale, customerId, orderId) : Promise.resolve(null),
    // Seçici için ilk sayfa yeter: müşteri şikâyetini eski bir siparişe değil, yakın zamanda
    // aldığına yazar. Sayfalama eklemek listeyi arşive çevirir, oysa burada bir SEÇİM yapılıyor.
    orderId ? Promise.resolve(null) : listCustomerOrders(locale as Locale, customerId),
  ]);

  // Rota bir sipariş söylüyor ama o sipariş yok ya da başkasının: 404. "Yok" ile "senin değil"
  // ayrımını yapmak, olmayan bir siparişin varlığını doğrulatmak olurdu.
  if (orderId && !order) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        nav: 'support',
        back: order
          ? { label: `← ${order.referenceNo ?? ''}`.trim(), href: { pathname: '/orders/[reference]', params: { reference: order.id } } }
          : { label: t.backToList, href: '/support' },
        title: order ? t.new.title : t.new.generalTitle,
      }}
    >
      <NewTicketForm t={t} locale={locale as Locale} device={device} order={order} orders={orders?.orders ?? []} />
    </SiteFrame>
  );
}
