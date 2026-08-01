import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { SupportClient } from '../support-client';
import { NewTicketLink } from '../components/new-ticket-link';
import { ticketTitle } from '../components/ticket-labels';
import { loadSupport } from '../load';
import type { Messages } from '../support-types';
import messages from '../messages.json';

/**
 * Talep yazışması (08.6) — cevap ve durum bildirimi e-postalarının indiği adres (14.7 · 16.4).
 *
 * **Masaüstünde AYRI bir ekran değil**, `/support`'un iki bölmeli düzeninde sağ bölmenin dolduğu
 * hâl; mobilde tam sayfa yazışma. Bu yüzden liste burada da yükleniyor — cihaz kararı istemcide
 * kesinleşiyor ve sunucu masaüstü tahmininde yanılırsa sol bölme boş kalırdı.
 *
 * Başkasının talebi 404 verir, "yetkiniz yok" DEMEZ: kapı `null` döndüğünde "yok" ile "senin değil"
 * ayrımını yapmıyor (`lib/ticket/read`) — ayrımı burada yapmak, olmayan bir kaydın varlığını
 * doğrulatmak olurdu.
 */
interface TicketPageProps {
  params: Promise<{ locale: string; ticket: string }>;
}

export default async function TicketPage({ params }: TicketPageProps) {
  const { locale, ticket: ticketId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, data] = await Promise.all([detectDevice(), loadSupport(locale as Locale, ticketId)]);
  if (!data.selected) notFound();

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        // Masaüstü `nav`ı, mobil `back`i çizer (`site-frame`): web'de sekmeler görünür kalmalı
        // (tasarımın web karesinde "Taleplerim" aktif), mobilde ise geri yolu listeye gitmeli.
        nav: 'support',
        back: { label: t.backToList, href: '/support' },
        title: ticketTitle(data.selected, t),
        right: <NewTicketLink label={t.newTicket} />,
      }}
      fill
    >
      <SupportClient
        t={t}
        locale={locale as Locale}
        device={device}
        mode="detail"
        first={data.tickets}
        selected={data.selected}
      />
    </SiteFrame>
  );
}
