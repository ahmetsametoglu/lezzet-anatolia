import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, NoticeCard, EmailLayout, StatusBlock, StatusPill, TotalsCard } from '../components/email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * İade işlendi — yalnız iade kapandığında gider, çünkü "işleme aldık" müşteriye bir şey söylemez, parasının döndüğü an söyler.
 * Zaman çizgisi yok; döküm iadeye konu ürün bazındadır.
 */

interface Copy {
  pill: string;
  title: (name: string | null) => string;
  intro: (referenceNo: string, amount: string) => React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: (amount: string) => string;
  blockHeadline: (at: string | null) => string;
  blockDetail: string;
  breakdown: string;
  total: string;
  note: (previous: string, current: string | null) => string;
  onDeliveryTitle: string;
  onDeliveryText: string;
  cta: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '↩ İade işlendi',
    title: (name) => (name ? `İadeniz yolda, ${name}.` : 'İadeniz yolda.'),
    intro: (ref, amount) => (
      <>
        <strong style={{ color: '#3a4147' }}>{ref}</strong> numaralı siparişinizle ilgili talebinizi inceledik.{' '}
        <strong style={{ color: '#3a4147' }}>{amount}</strong> ödeme yönteminize iade edildi.
      </>
    ),
    subject: (ref) => `İadeniz işlendi — ${ref}`,
    preview: (amount) => `${amount} iade edildi — talep kapandı.`,
    blockHeadline: (at) => (at ? `Talep kapandı · ${at}` : 'Talep kapandı'),
    blockDetail: 'İade onaylandı ve işleme alındı. Sizin yapmanız gereken bir şey kalmadı.',
    breakdown: 'İade dökümü',
    total: 'İade toplamı',
    note: (previous, current) =>
      current
        ? `Ödeme yönteminize iade; hesaba geçiş süresi bankanıza bağlıdır. Sipariş toplamınız ${previous} → ${current} olarak güncellendi.`
        : `Ödeme yönteminize iade; hesaba geçiş süresi bankanıza bağlıdır.`,
    onDeliveryTitle: 'Kapıda ödeme seçmiştiniz',
    onDeliveryText: 'İade yerine kapıda güncel tutarı ödersiniz; fark bu tutardan zaten düşülmüştür.',
    cta: 'Siparişe dön',
  },
  fr: {
    pill: '↩ Remboursement traité',
    title: (name) => (name ? `Votre remboursement est en route, ${name}.` : 'Votre remboursement est en route.'),
    intro: (ref, amount) => (
      <>
        Nous avons examiné votre demande concernant la commande <strong style={{ color: '#3a4147' }}>{ref}</strong>.{' '}
        <strong style={{ color: '#3a4147' }}>{amount}</strong> ont été remboursés sur votre moyen de paiement.
      </>
    ),
    subject: (ref) => `Votre remboursement a été traité — ${ref}`,
    preview: (amount) => `${amount} remboursés — demande clôturée.`,
    blockHeadline: (at) => (at ? `Demande clôturée · ${at}` : 'Demande clôturée'),
    blockDetail: 'Le remboursement a été validé et traité. Vous n’avez plus rien à faire.',
    breakdown: 'Détail du remboursement',
    total: 'Total remboursé',
    note: (previous, current) =>
      current
        ? `Remboursement sur votre moyen de paiement ; le délai dépend de votre banque. Total de la commande : ${previous} → ${current}.`
        : `Remboursement sur votre moyen de paiement ; le délai dépend de votre banque.`,
    onDeliveryTitle: 'Vous aviez choisi le paiement à la livraison',
    onDeliveryText: 'Au lieu d’un remboursement, vous réglerez le montant actualisé à la livraison : la différence est déjà déduite.',
    cta: 'Revenir à la commande',
  },
  de: {
    pill: '↩ Erstattung bearbeitet',
    title: (name) => (name ? `Ihre Erstattung ist unterwegs, ${name}.` : 'Ihre Erstattung ist unterwegs.'),
    intro: (ref, amount) => (
      <>
        Wir haben Ihre Anfrage zur Bestellung <strong style={{ color: '#3a4147' }}>{ref}</strong> geprüft.{' '}
        <strong style={{ color: '#3a4147' }}>{amount}</strong> wurden auf Ihr Zahlungsmittel erstattet.
      </>
    ),
    subject: (ref) => `Ihre Erstattung wurde bearbeitet — ${ref}`,
    preview: (amount) => `${amount} erstattet — Anfrage abgeschlossen.`,
    blockHeadline: (at) => (at ? `Anfrage abgeschlossen · ${at}` : 'Anfrage abgeschlossen'),
    blockDetail: 'Die Erstattung wurde genehmigt und bearbeitet. Für Sie ist nichts weiter zu tun.',
    breakdown: 'Erstattungsdetails',
    total: 'Erstattet gesamt',
    note: (previous, current) =>
      current
        ? `Erstattung auf Ihr Zahlungsmittel; die Dauer hängt von Ihrer Bank ab. Bestellsumme: ${previous} → ${current}.`
        : `Erstattung auf Ihr Zahlungsmittel; die Dauer hängt von Ihrer Bank ab.`,
    onDeliveryTitle: 'Sie hatten Zahlung bei Lieferung gewählt',
    onDeliveryText: 'Statt einer Erstattung zahlen Sie bei der Lieferung nur den aktualisierten Betrag – der Abzug ist darin bereits berücksichtigt.',
    cta: 'Zur Bestellung',
  },
};

export function orderRefundedSubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderRefundedEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];
  const amount = data.refund?.amount ?? '—';
  // Döküm YALNIZ iadeye konu kalemlerden kurulur; el değmemiş kalem müşterinin sorusu değil.
  const refundedLines = data.lines.filter((line) => line.shortfall);

  return (
    <EmailLayout
      preview={t.preview(amount)}
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
      <StatusPill label={t.pill} tone="green" />
      <Headline title={t.title(data.customerName)} intro={t.intro(data.referenceNo, amount)} />
      <StatusBlock tone="green" headline={t.blockHeadline(data.statusAt)} detail={t.blockDetail} />
      {data.refund && (
        <TotalsCard
          title={t.breakdown}
          totals={refundedLines.map((line) => ({ label: line.name, value: line.amount ?? '' }))}
          grandTotal={{ label: t.total, value: data.refund.amount }}
          paymentNote={null}
          footnote={t.note(data.refund.previousTotal, data.refund.currentTotal)}
        />
      )}
      {!data.paidOnline && <NoticeCard title={t.onDeliveryTitle} text={t.onDeliveryText} />}
      <CtaButton label={t.cta} url={data.orderUrl} />
    </EmailLayout>
  );
}
