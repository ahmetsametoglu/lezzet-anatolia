import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, NoticeCard, EmailLayout, StatusBlock, StatusPill, TotalsCard } from '../components/email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * **İade işlendi** (14.5) — `design/project/Email - Siparis Iade.html`.
 *
 * Yalnız iade KAPANDIĞINDA gider; inceleme sürerken ara bildirim yoktur (tasarım kuralı) — "işleme
 * aldık" maili müşteriye bir şey söylemez, parasının döndüğü an söyler.
 *
 * Zaman çizgisi yok, tek durum bloğu var. Döküm kalem bazındadır: hangi kalem için ne kadar.
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
        ? `Ödeme yönteminize iade · 3–5 iş günü. Sipariş toplamınız ${previous} → ${current} olarak güncellendi.`
        : `Ödeme yönteminize iade · 3–5 iş günü.`,
    onDeliveryTitle: 'Kapıda ödeme seçmiştiniz',
    onDeliveryText: 'İade yerine tahsilat güncel tutardan yapılır; kuryeye ödediğiniz tutar zaten düşülmüş olur.',
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
        ? `Remboursement sur votre moyen de paiement · 3 à 5 jours ouvrés. Total de la commande : ${previous} → ${current}.`
        : `Remboursement sur votre moyen de paiement · 3 à 5 jours ouvrés.`,
    onDeliveryTitle: 'Vous aviez choisi le paiement à la livraison',
    onDeliveryText: 'Au lieu d’un remboursement, l’encaissement se fait sur le montant actualisé ; ce que vous avez réglé est déjà déduit.',
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
        ? `Erstattung auf Ihr Zahlungsmittel · 3–5 Werktage. Bestellsumme: ${previous} → ${current}.`
        : `Erstattung auf Ihr Zahlungsmittel · 3–5 Werktage.`,
    onDeliveryTitle: 'Sie hatten Zahlung bei Lieferung gewählt',
    onDeliveryText: 'Statt einer Erstattung wird der aktualisierte Betrag eingezogen; Ihre Zahlung an den Kurier ist bereits abgezogen.',
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
