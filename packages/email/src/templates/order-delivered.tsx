import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { Headline, NoticeCard, OrderEmailLayout, OrderHeaderCard, StatusPill, SummaryCard, Timeline } from '../components/order-email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * **Teslim edildi** (14.5) — kurye teslimi işaretleyince. `design/project/Email - Siparis Teslim Edildi.html`.
 *
 * Sorusu artık "ne geliyor" değil: mal geldi. Bu yüzden kalem listesi yerine **teslimat özeti**
 * (kaç kalem, kaç adet, ne tuttu) ve bir belge bağlantısı var. Belgenin üstündeki *"resmî fatura
 * değildir"* ibaresi tasarımın zorunlu maddesidir — özet fatura yerine geçmez (DOMAIN §6).
 */

interface Copy {
  pill: string;
  status: string;
  title: (name: string | null) => string;
  intro: (referenceNo: string) => React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: (referenceNo: string) => string;
  summaryTitle: string;
  countLabel: (lines: number, qty: number) => string;
  notInvoice: string;
  summaryLink: string;
  helpTitle: string;
  helpText: string;
  helpLink: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '✓ Teslim edildi',
    status: '✓ Teslim edildi',
    title: (name) => (name ? `Afiyet olsun, ${name}.` : 'Afiyet olsun.'),
    intro: (ref) => (
      <>
        <strong style={{ color: '#3a4147' }}>{ref}</strong> numaralı siparişiniz kapınıza teslim edildi.
      </>
    ),
    subject: (ref) => `Siparişiniz teslim edildi — ${ref}`,
    preview: (ref) => `${ref} teslim edildi — afiyet olsun!`,
    summaryTitle: 'Teslimat özeti',
    countLabel: (lines, qty) => `${lines} kalem · ${qty} adet`,
    notInvoice: 'Belge kalemleri ve teslim edilen miktarları gösterir; resmî fatura değildir.',
    summaryLink: '📄 Teslimat özetini görüntüle →',
    helpTitle: 'Bir sorun mu var?',
    helpText: 'Eksik, hasarlı ya da beklediğiniz gibi olmayan bir şey varsa doğrudan bize iletin — aynı gün dönüş yapıyoruz.',
    helpLink: 'Sorun bildir →',
  },
  fr: {
    pill: '✓ Livrée',
    status: '✓ Livrée',
    title: (name) => (name ? `Bon appétit, ${name}.` : 'Bon appétit.'),
    intro: (ref) => (
      <>
        Votre commande <strong style={{ color: '#3a4147' }}>{ref}</strong> a été livrée chez vous.
      </>
    ),
    subject: (ref) => `Votre commande a été livrée — ${ref}`,
    preview: (ref) => `${ref} livrée — bon appétit !`,
    summaryTitle: 'Récapitulatif de livraison',
    countLabel: (lines, qty) => `${lines} articles · ${qty} unités`,
    notInvoice: 'Ce document indique les articles et les quantités livrées ; il ne constitue pas une facture.',
    summaryLink: '📄 Voir le récapitulatif →',
    helpTitle: 'Un problème ?',
    helpText: 'Article manquant, abîmé ou non conforme : écrivez-nous directement — nous répondons le jour même.',
    helpLink: 'Signaler un problème →',
  },
  de: {
    pill: '✓ Zugestellt',
    status: '✓ Zugestellt',
    title: (name) => (name ? `Guten Appetit, ${name}.` : 'Guten Appetit.'),
    intro: (ref) => (
      <>
        Ihre Bestellung <strong style={{ color: '#3a4147' }}>{ref}</strong> wurde bei Ihnen zugestellt.
      </>
    ),
    subject: (ref) => `Ihre Bestellung wurde zugestellt — ${ref}`,
    preview: (ref) => `${ref} zugestellt — guten Appetit!`,
    summaryTitle: 'Lieferübersicht',
    countLabel: (lines, qty) => `${lines} Artikel · ${qty} Stück`,
    notInvoice: 'Das Dokument zeigt Artikel und gelieferte Mengen; es ist keine offizielle Rechnung.',
    summaryLink: '📄 Lieferübersicht ansehen →',
    helpTitle: 'Gibt es ein Problem?',
    helpText: 'Fehlt etwas, ist etwas beschädigt oder nicht wie erwartet — schreiben Sie uns direkt, wir antworten am selben Tag.',
    helpLink: 'Problem melden →',
  },
};

export function orderDeliveredSubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderDeliveredEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];
  const qty = data.lines.reduce((sum, line) => sum + line.qty, 0);
  // Eksik karşılanma notu kalem satırlarından toplanır: teslimde kalem listesi gösterilmediği için
  // fark bilgisi özet notuna taşınır — yoksa müşteri iadeyi hiç görmezdi.
  const shortfalls = data.lines.map((line) => line.shortfall).filter((note): note is string => Boolean(note));

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
      <SummaryCard
        title={t.summaryTitle}
        countLabel={t.countLabel(data.lines.length, qty)}
        amount={data.grandTotal?.value ?? ''}
        note={[...shortfalls, t.notInvoice].join(' ')}
        linkLabel={t.summaryLink}
        linkUrl={data.deliverySummaryUrl ?? data.orderUrl}
      />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </OrderEmailLayout>
  );
}
