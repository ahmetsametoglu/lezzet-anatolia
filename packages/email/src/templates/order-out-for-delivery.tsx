import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, InfoBlock, ItemsCard, NoticeCard, EmailLayout, HeaderCard, StatusPill, Timeline, TotalsCard } from '../components/email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * Yola çıktı — kurye rotaya çıkınca ya da koli kargoya verilince gider; ürün listesi fiyat değil giden adedi gösterir, eksik çıkan
 * varsa fark burada görünür. Saat aralığı verisi olmadığı için giriş cümlesi saat vaat etmez, teslimatın kendisi alttaki bloktadır.
 */

interface Copy {
  pill: string;
  status: string;
  title: string;
  intro: string;
  subject: (referenceNo: string) => string;
  preview: string;
  track: string;
  helpTitle: string;
  helpText: string;
  helpLink: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '● Yolda',
    status: '● Yolda',
    title: 'Siparişiniz yola çıktı.',
    intro: 'Teslimat bilgileri aşağıda.',
    subject: (ref) => `Siparişiniz yolda — ${ref}`,
    preview: 'Siparişiniz yola çıktı.',
    track: 'Siparişi takip et',
    helpTitle: 'Teslimat için müsait değil misiniz?',
    helpText: 'Bize hemen yazın; birlikte bir çözüm bulalım.',
    helpLink: 'Bize yazın →',
  },
  fr: {
    pill: '● En route',
    status: '● En route',
    title: 'Votre commande est en route.',
    intro: 'Les informations de livraison figurent ci-dessous.',
    subject: (ref) => `Votre commande est en route — ${ref}`,
    preview: 'Votre commande est en route.',
    track: 'Suivre ma commande',
    helpTitle: 'Vous n’êtes pas disponible ?',
    helpText: 'Écrivez-nous sans attendre : nous trouverons une solution ensemble.',
    helpLink: 'Nous écrire →',
  },
  de: {
    pill: '● Unterwegs',
    status: '● Unterwegs',
    title: 'Ihre Bestellung ist unterwegs.',
    intro: 'Die Lieferdetails finden Sie unten.',
    subject: (ref) => `Ihre Bestellung ist unterwegs — ${ref}`,
    preview: 'Ihre Bestellung ist unterwegs.',
    track: 'Bestellung verfolgen',
    helpTitle: 'Sind Sie nicht da?',
    helpText: 'Schreiben Sie uns gleich – wir finden gemeinsam eine Lösung.',
    helpLink: 'Schreiben Sie uns →',
  },
};

export function orderOutForDeliverySubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderOutForDeliveryEmail({ data, brandName, postalAddress }: OrderEmailProps) {
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
      {/* Kargoda her koli kendi satırında takip numarası ve bağlantısıyla durur, çünkü tek satır öteki kolileri gizlerdi; sıra
          (`2/3`) yalnız çok kolide basılır. Bağlantısı olmayan koli numarayı yine gösterir, çünkü numara elle de aratılabilir. */}
      {data.tracking?.length ? (
        data.tracking.map((parcel) => (
          <InfoBlock
            key={parcel.number}
            icon="📦"
            headline={parcel.ordinal ? `${parcel.ordinal} · ${parcel.number}` : parcel.number}
            detail={parcel.url ? <a href={parcel.url} style={{ color: '#5f7a2c' }}>{parcel.url}</a> : ''}
          />
        ))
      ) : (
        data.delivery && <InfoBlock icon={data.delivery.icon} headline={data.delivery.headline} detail={data.delivery.detail} />
      )}
      <ItemsCard title={shared.sentItemsTitle} lines={data.lines} />
      <TotalsCard title={shared.totalsTitle} totals={[]} grandTotal={data.grandTotal} paymentNote={data.paymentNote} />
      <CtaButton label={t.track} url={data.orderUrl} />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </EmailLayout>
  );
}
