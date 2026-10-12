import * as React from 'react';
import type { SalesInvoiceNotification } from '@lezzet/types';
import { EmailLayout, HeaderCard, Headline, InfoBlock, ItemsCard, NoticeCard, StatusPill, TotalsCard } from '../components/email-layout';
import { BRAND_COPY } from './brand-copy';

void React;

/**
 * Satış faturası: Pennylane'de kesilen fatura PDF olarak ekte gider, e-posta onu taşır. Banka bilgisi e-postada değil faturadadır,
 * çünkü tek kaynağı Pennylane'deki şablondur.
 */

export interface SalesInvoiceEmailProps {
  data: SalesInvoiceNotification;
  /** Faturayı kesen işin adı: "Lezzet Anatolie" ya da "QUALITE". */
  brandName: string;
  /** Alt bilgideki yasal adres satırı — `packages/brand`'ten gelir, şablonda sabit değil. */
  postalAddress: string;
}

interface Copy {
  pill: string;
  title: string;
  intro: string;
  subject: (invoiceNumber: string) => string;
  preview: (data: SalesInvoiceNotification) => string;
  issued: (issuedOn: string) => string;
  open: string;
  settled: string;
  totalsTitle: string;
  net: string;
  vat: string;
  gross: string;
  dueNote: (dueOn: string) => string;
  settledNote: string;
  ordersTitle: (count: number) => string;
  attachment: string;
  /** Ödenmiş faturada banka bilgisinin yerini söylemek gereksizdir; yalnız dosya adı kalır. */
  attachmentDetail: (fileName: string, settled: boolean) => string;
  transferTitle: string;
  transferText: (invoiceNumber: string) => string;
  footerNotice: (invoiceNumber: string) => string;
}

const COPY: Record<SalesInvoiceNotification['locale'], Copy> = {
  fr: {
    pill: '📄 Facture',
    title: 'Voici votre facture.',
    intro: 'Vous trouverez votre facture en pièce jointe, au format PDF.',
    subject: (no) => `Votre facture ${no}`,
    preview: (d) =>
      d.settled
        ? `Facture ${d.invoiceNumber} — ${d.grandTotal}, réglée`
        : `Facture ${d.invoiceNumber} — ${d.grandTotal} à régler avant le ${d.dueOn}`,
    issued: (date) => `émise le ${date}`,
    open: 'À régler',
    settled: '✓ Réglée',
    totalsTitle: 'Montant',
    net: 'Total HT',
    vat: 'TVA',
    gross: 'Total TTC',
    dueNote: (date) => `À régler par virement avant le ${date}`,
    settledNote: '✓ Déjà réglée — aucun paiement à effectuer',
    ordersTitle: (n) => (n === 1 ? 'Commande facturée' : 'Commandes facturées'),
    attachment: 'Facture jointe',
    attachmentDetail: (file, settled) => (settled ? file : `${file} — les coordonnées bancaires figurent sur la facture.`),
    transferTitle: 'Paiement par virement',
    transferText: (no) =>
      `Merci d'indiquer le numéro de facture ${no} dans le libellé de votre virement\u00a0: il nous permet de rapprocher votre paiement.`,
    footerNotice: (no) => `Cet e-mail concerne la facture ${no}.`,
  },
  de: {
    pill: '📄 Rechnung',
    title: 'Hier ist Ihre Rechnung.',
    intro: 'Ihre Rechnung finden Sie im Anhang als PDF.',
    subject: (no) => `Ihre Rechnung ${no}`,
    preview: (d) =>
      d.settled
        ? `Rechnung ${d.invoiceNumber} – ${d.grandTotal}, bezahlt`
        : `Rechnung ${d.invoiceNumber} – ${d.grandTotal}, zahlbar bis ${d.dueOn}`,
    issued: (date) => `ausgestellt am ${date}`,
    open: 'Offen',
    settled: '✓ Bezahlt',
    totalsTitle: 'Betrag',
    net: 'Gesamt netto',
    vat: 'USt.',
    gross: 'Gesamt brutto',
    dueNote: (date) => `Zahlbar per Überweisung bis ${date}`,
    settledNote: '✓ Bereits bezahlt – keine Zahlung erforderlich',
    ordersTitle: (n) => (n === 1 ? 'Berechnete Bestellung' : 'Berechnete Bestellungen'),
    attachment: 'Rechnung im Anhang',
    attachmentDetail: (file, settled) => (settled ? file : `${file} – die Bankverbindung finden Sie auf der Rechnung.`),
    transferTitle: 'Zahlung per Überweisung',
    transferText: (no) =>
      `Bitte geben Sie die Rechnungsnummer ${no} im Verwendungszweck Ihrer Überweisung an – so können wir Ihre Zahlung zuordnen.`,
    footerNotice: (no) => `Diese E-Mail betrifft die Rechnung ${no}.`,
  },
};

export function salesInvoiceSubject(data: SalesInvoiceNotification): string {
  return COPY[data.locale].subject(data.invoiceNumber);
}

export function SalesInvoiceEmail({ data, brandName, postalAddress }: SalesInvoiceEmailProps) {
  const t = COPY[data.locale];
  const brand = BRAND_COPY[data.locale];
  return (
    <EmailLayout
      preview={t.preview(data)}
      locale={data.locale}
      brandName={brandName}
      region={brand.region}
      footer={{
        address: postalAddress,
        notice: t.footerNotice(data.invoiceNumber),
        preferencesLabel: brand.preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <StatusPill label={t.pill} />
      <Headline title={t.title} intro={t.intro} />
      <HeaderCard title={data.invoiceNumber} meta={t.issued(data.issuedOn)} statusLabel={data.settled ? t.settled : t.open} metaBelow />
      <TotalsCard
        title={t.totalsTitle}
        totals={[
          { label: t.net, value: data.netTotal },
          { label: t.vat, value: data.vatTotal },
        ]}
        grandTotal={{ label: t.gross, value: data.grandTotal }}
        paymentNote={data.settled ? t.settledNote : t.dueNote(data.dueOn)}
      />
      <ItemsCard title={t.ordersTitle(data.orders.length)} lines={data.orders} />
      <InfoBlock icon="📎" headline={t.attachment} detail={t.attachmentDetail(data.attachmentName, data.settled)} />
      {data.settled ? null : <NoticeCard title={t.transferTitle} text={t.transferText(data.invoiceNumber)} />}
    </EmailLayout>
  );
}
