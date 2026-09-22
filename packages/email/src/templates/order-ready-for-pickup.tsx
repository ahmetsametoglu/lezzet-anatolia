import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, InfoBlock, ItemsCard, NoticeCard, EmailLayout, HeaderCard, StatusPill, Timeline, TotalsCard } from '../components/email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * **Hazır, depodan alabilirsiniz** (gel-al) — "yola çıktı"nın gel-al karşılığı: mal yola çıkmaz, müşteri gelir.
 * Aynı iskelet; sorusu "**nereye ve ne zaman geleyim?**". Teslimat bloğu depoyu ve aranacak numarayı yazar, randevu
 * telefonla kararlaştırılır (sistem saat vaat etmez). Tasarım dosyasında karşılığı yok; yola çıktı düzeni aynen.
 */

interface Copy {
  pill: string;
  status: string;
  title: string;
  intro: React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: string;
  itemsTitle: string;
  cta: string;
  helpTitle: string;
  helpText: string;
  helpLink: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '● Hazır',
    status: '● Teslime hazır',
    title: 'Siparişiniz hazır.',
    intro: <>Siparişiniz depoda sizi bekliyor. Teslim saatini kararlaştırmak için aşağıdaki numaradan bize ulaşın.</>,
    subject: (ref) => `Siparişiniz hazır — ${ref}`,
    preview: 'Siparişiniz depodan teslim alınmaya hazır.',
    itemsTitle: 'Hazırlanan kalemler',
    cta: 'Siparişi gör',
    helpTitle: 'Gelemeyecek misiniz?',
    helpText: 'Bize yazın ya da arayın; sipariş sizin için bekletilir.',
    helpLink: 'Bize yazın →',
  },
  fr: {
    pill: '● Prête',
    status: '● Prête au retrait',
    title: 'Votre commande est prête.',
    intro: <>Votre commande vous attend à l’entrepôt. Contactez-nous au numéro ci-dessous pour convenir de l’heure du retrait.</>,
    subject: (ref) => `Votre commande est prête — ${ref}`,
    preview: 'Votre commande est prête à être retirée à l’entrepôt.',
    itemsTitle: 'Articles préparés',
    cta: 'Voir ma commande',
    helpTitle: 'Vous ne pouvez pas venir ?',
    helpText: 'Écrivez-nous ou appelez-nous ; la commande est gardée pour vous.',
    helpLink: 'Nous écrire →',
  },
  de: {
    pill: '● Bereit',
    status: '● Abholbereit',
    title: 'Ihre Bestellung ist bereit.',
    intro: <>Ihre Bestellung wartet im Lager auf Sie. Rufen Sie uns unter der Nummer unten an, um die Abholzeit zu vereinbaren.</>,
    subject: (ref) => `Ihre Bestellung ist abholbereit — ${ref}`,
    preview: 'Ihre Bestellung kann im Lager abgeholt werden.',
    itemsTitle: 'Vorbereitete Artikel',
    cta: 'Bestellung ansehen',
    helpTitle: 'Können Sie nicht kommen?',
    helpText: 'Schreiben Sie uns oder rufen Sie an; die Bestellung wird für Sie aufbewahrt.',
    helpLink: 'Schreiben Sie uns →',
  },
};

export function orderReadyForPickupSubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderReadyForPickupEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];

  return (
    <EmailLayout
      preview={t.preview}
      locale={data.locale}
      brandName={brandName}
      region={shared.region}
      footer={{
        address: postalAddress,
        notice: shared.footerNotice(data.referenceNo),
        preferencesLabel: shared.preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <StatusPill label={t.pill} />
      <Headline title={t.title} intro={t.intro} />
      <HeaderCard title={data.referenceNo} meta={data.orderedOn} statusLabel={t.status} />
      <Timeline steps={data.steps} labels={shared.steps} />
      {data.delivery && <InfoBlock icon={data.delivery.icon} headline={data.delivery.headline} detail={data.delivery.detail} />}
      <ItemsCard title={t.itemsTitle} lines={data.lines} />
      <TotalsCard title={shared.totalsTitle} totals={[]} grandTotal={data.grandTotal} paymentNote={data.paymentNote} />
      <CtaButton label={t.cta} url={data.orderUrl} />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </EmailLayout>
  );
}
