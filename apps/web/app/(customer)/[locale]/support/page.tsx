import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@lezzet/i18n';
import supportMessages from '@lezzet/i18n/customer/support';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { detectDevice } from '@/lib/device';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { recordPageView } from '@/lib/analytics/page-view';
import { routing } from '@/i18n/routing';
import { SupportClient } from './support-client';
import { NewTicketLink } from './components/new-ticket-link';
import { loadSupport } from './load';
import type { Messages } from './support-types';
import messages from './messages.json';

/** Taleplerim: hesap sekmesinden, sipariş detayındaki "Sorun bildir"den ve cevap e-postasındaki bağlantıdan gelinir. */
interface SupportPageProps {
  params: Promise<{ locale: string }>;
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  void recordPageView('/support');

  const t: Messages = messages[locale];
  const phone = supportMessages[locale].list;
  const [device, data] = await Promise.all([detectDevice(), loadSupport(locale as Locale)]);

  return (
    <SiteFrame
      device={device}
      locale={locale}
      accountChrome={{
        nav: 'support',
        back: { label: t.backToAccount, href: '/account' },
        title: t.title,
        // Telefonda native'in metin eylemi; boş listede çizilmez, çünkü ortadaki düğme aynı işi farklı adla yapardı.
        right:
          device !== 'mobile' ? (
            <NewTicketLink label={t.newTicket} />
          ) : data.tickets.rows.length === 0 ? undefined : (
            <TextAction label={phone.new} ariaLabel={phone.newLabel} href="/support/new" />
          ),
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
