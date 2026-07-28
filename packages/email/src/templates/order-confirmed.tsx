import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, InfoBlock, ItemsCard, OrderEmailLayout, OrderHeaderCard, StatusPill, Timeline, TotalsCard } from '../components/order-email-layout';
import { SHARED_COPY } from './order-copy';

void React;

/**
 * **Sipariş onaylandı** (14.5) — ödeme sonrası anında. `design/project/Email - Siparis Onaylandi.html`.
 *
 * Sorusu: "aldınız mı, ne zaman gelecek?" Bu yüzden kalemler ve tutar TAM gösterilir; zaman
 * çizgisinin yalnız ilk adımı doludur.
 */

export interface OrderEmailProps {
  data: OrderNotification;
  brandName: string;
  /** Alt bilgideki yasal adres satırı — `packages/brand`'ten gelir, şablonda sabit değil. */
  postalAddress: string;
}

interface Copy {
  pill: string;
  status: string;
  title: (name: string | null) => string;
  intro: (referenceNo: string) => React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: (referenceNo: string) => string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '✓ Sipariş onaylandı',
    status: '● Onaylandı',
    title: (name) => (name ? `Siparişiniz alındı, ${name}.` : 'Siparişiniz alındı.'),
    intro: (ref) => (
      <>
        <strong style={{ color: '#3a4147' }}>{ref}</strong> numaralı siparişiniz mutfağımıza ulaştı. Soğuk zincirle hazırlanıp
        kapınıza teslim edilecek.
      </>
    ),
    subject: (ref) => `Siparişiniz alındı — ${ref}`,
    preview: (ref) => `${ref} numaralı siparişiniz alındı.`,
  },
  fr: {
    pill: '✓ Commande confirmée',
    status: '● Confirmée',
    title: (name) => (name ? `Votre commande est enregistrée, ${name}.` : 'Votre commande est enregistrée.'),
    intro: (ref) => (
      <>
        Votre commande <strong style={{ color: '#3a4147' }}>{ref}</strong> est arrivée dans notre atelier. Elle sera préparée en
        chaîne du froid et livrée chez vous.
      </>
    ),
    subject: (ref) => `Votre commande est enregistrée — ${ref}`,
    preview: (ref) => `Votre commande ${ref} est enregistrée.`,
  },
  de: {
    pill: '✓ Bestellung bestätigt',
    status: '● Bestätigt',
    title: (name) => (name ? `Ihre Bestellung ist eingegangen, ${name}.` : 'Ihre Bestellung ist eingegangen.'),
    intro: (ref) => (
      <>
        Ihre Bestellung <strong style={{ color: '#3a4147' }}>{ref}</strong> ist bei uns eingegangen. Sie wird gekühlt vorbereitet
        und zu Ihnen geliefert.
      </>
    ),
    subject: (ref) => `Ihre Bestellung ist eingegangen — ${ref}`,
    preview: (ref) => `Ihre Bestellung ${ref} ist eingegangen.`,
  },
};

export function orderConfirmedSubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderConfirmedEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];

  return (
    <OrderEmailLayout
      preview={t.preview(data.referenceNo)}
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
      <Headline title={t.title(data.customerName)} intro={t.intro(data.referenceNo)} />
      <OrderHeaderCard referenceNo={data.referenceNo} orderedOn={data.orderedOn} statusLabel={t.status} />
      <Timeline steps={data.steps} labels={shared.steps} />
      {data.delivery && <InfoBlock icon={data.delivery.icon} headline={data.delivery.headline} detail={data.delivery.detail} />}
      <ItemsCard title={shared.itemsTitle} lines={data.lines} />
      <TotalsCard title={shared.totalsTitle} totals={data.totals} grandTotal={data.grandTotal} paymentNote={data.paymentNote} />
      <CtaButton label={shared.viewOrder} url={data.orderUrl} />
    </OrderEmailLayout>
  );
}
