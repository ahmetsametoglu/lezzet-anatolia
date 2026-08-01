import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import { detectDevice } from '@/lib/device';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { routing } from '@/i18n/routing';
import { SupportClient } from './support-client';
import { NewTicketLink } from './components/new-ticket-link';
import { loadSupport } from './load';
import type { Messages } from './support-types';
import messages from './messages.json';

/**
 * Taleplerim (08.6) — hesap alanının üçüncü bölümü. Buraya üç yerden gelinir: hesap sekmesi,
 * sipariş detayındaki "Sorun bildir" ve cevap bildirimi e-postasındaki bağlantı.
 *
 * Rota `/support`; dile göre karşılıkları `routing.ts`'te (`/assistance` · `/anfrage` · `/talep`).
 */
interface SupportPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t: Messages = messages[locale];
  const [device, data] = await Promise.all([detectDevice(), loadSupport(locale as Locale)]);

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        nav: 'support',
        back: { label: t.backToAccount, href: '/account' },
        title: t.title,
        right: <NewTicketLink label={t.newTicket} />,
      }}
      // Masaüstünde bu rota da bir yazışma gösteriyor (iki bölme), mobilde bir gelen kutusu —
      // ikisi de ekranı doldurur, ikisi de kendi içinde kayar.
      fill
    >
      <SupportClient
        t={t}
        locale={locale as Locale}
        device={device}
        mode="list"
        first={data.tickets}
        selected={data.selected}
      />
    </SiteFrame>
  );
}
