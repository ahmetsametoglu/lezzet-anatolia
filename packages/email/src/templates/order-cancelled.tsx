import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, NoticeCard, OrderEmailLayout, PlainListCard, StatusBlock, StatusPill, TotalsCard } from '../components/order-email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * **Sipariş iptal edildi** (14.5) — `design/project/Email - Siparis Iptal.html`.
 *
 * İSTİSNA bildirimi: zaman çizgisi YOKTUR, yerine tek durum bloğu vardır (tasarım kuralı — yolculuk
 * bitmedi, kesildi). Para çözümü ilk karttadır: müşterinin ilk sorusu "param ne olacak".
 */

interface Copy {
  pill: string;
  title: string;
  intro: (referenceNo: string, refunded: boolean) => React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: (referenceNo: string, amount: string | null) => string;
  blockHeadline: (at: string | null) => string;
  blockDetail: string;
  refundTitle: string;
  orderAmount: string;
  refunded: string;
  refundNote: string;
  collectNote: string;
  itemsTitle: string;
  reorder: string;
  helpTitle: string;
  helpText: string;
  helpLink: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '✕ Sipariş iptal edildi',
    title: 'Siparişiniz iptal edildi.',
    intro: (ref, refunded) => (
      <>
        <strong style={{ color: '#3a4147' }}>{ref}</strong> numaralı siparişiniz hazırlığa girmeden iptal edildi.
        {refunded ? ' Ödediğiniz tutarın tamamı iade ediliyor.' : ' Tahsil edilmiş bir tutar yoktu, ödemeniz gerekmiyor.'}
      </>
    ),
    subject: (ref) => `Siparişiniz iptal edildi — ${ref}`,
    preview: (ref, amount) => (amount ? `${ref} iptal edildi, ${amount} iade sürecinde.` : `${ref} iptal edildi.`),
    blockHeadline: (at) => (at ? `İptal edildi · ${at}` : 'İptal edildi'),
    blockDetail: 'Sipariş hazırlığa girmedi, hiçbir kalem yola çıkmadı. Bu sipariş için başka bir işlem yapmanız gerekmiyor.',
    refundTitle: 'İade',
    orderAmount: 'Sipariş tutarı',
    refunded: 'İade edilen',
    refundNote: 'Ödeme yaptığınız yönteme iade edilir · bankaya bağlı olarak 3–5 iş günü içinde hesabınızda görünür.',
    collectNote: 'Bu sipariş için tahsilat yapılmamıştı — iade edilecek bir tutar yok.',
    itemsTitle: 'İptal edilen kalemler',
    reorder: 'Aynı siparişi tekrar oluştur',
    helpTitle: 'İptal beklediğiniz gibi değil miydi?',
    helpText: 'Siparişi siz iptal etmediyseniz ya da bir yanlışlık olduğunu düşünüyorsanız yazın — aynı gün dönüyoruz.',
    helpLink: 'Bize yazın →',
  },
  fr: {
    pill: '✕ Commande annulée',
    title: 'Votre commande a été annulée.',
    intro: (ref, refunded) => (
      <>
        Votre commande <strong style={{ color: '#3a4147' }}>{ref}</strong> a été annulée avant la préparation.
        {refunded ? ' La totalité du montant réglé vous est remboursée.' : ' Aucun montant n’avait été encaissé, vous n’avez rien à régler.'}
      </>
    ),
    subject: (ref) => `Votre commande a été annulée — ${ref}`,
    preview: (ref, amount) => (amount ? `${ref} annulée, ${amount} en cours de remboursement.` : `${ref} annulée.`),
    blockHeadline: (at) => (at ? `Annulée · ${at}` : 'Annulée'),
    blockDetail: 'La commande n’est pas entrée en préparation, aucun article n’est parti. Vous n’avez aucune démarche à faire.',
    refundTitle: 'Remboursement',
    orderAmount: 'Montant de la commande',
    refunded: 'Remboursé',
    refundNote: 'Remboursement sur le moyen de paiement utilisé · visible sous 3 à 5 jours ouvrés selon votre banque.',
    collectNote: 'Aucun encaissement n’avait été effectué — il n’y a rien à rembourser.',
    itemsTitle: 'Articles annulés',
    reorder: 'Recommander la même chose',
    helpTitle: 'L’annulation ne vous convient pas ?',
    helpText: 'Si vous n’êtes pas à l’origine de l’annulation ou pensez qu’il y a une erreur, écrivez-nous — réponse le jour même.',
    helpLink: 'Nous écrire →',
  },
  de: {
    pill: '✕ Bestellung storniert',
    title: 'Ihre Bestellung wurde storniert.',
    intro: (ref, refunded) => (
      <>
        Ihre Bestellung <strong style={{ color: '#3a4147' }}>{ref}</strong> wurde vor der Vorbereitung storniert.
        {refunded ? ' Der gezahlte Betrag wird vollständig erstattet.' : ' Es wurde nichts eingezogen, Sie müssen nichts zahlen.'}
      </>
    ),
    subject: (ref) => `Ihre Bestellung wurde storniert — ${ref}`,
    preview: (ref, amount) => (amount ? `${ref} storniert, ${amount} wird erstattet.` : `${ref} storniert.`),
    blockHeadline: (at) => (at ? `Storniert · ${at}` : 'Storniert'),
    blockDetail: 'Die Bestellung ging nicht in die Vorbereitung, kein Artikel wurde versandt. Sie müssen nichts weiter tun.',
    refundTitle: 'Erstattung',
    orderAmount: 'Bestellbetrag',
    refunded: 'Erstattet',
    refundNote: 'Erstattung auf das genutzte Zahlungsmittel · je nach Bank in 3–5 Werktagen sichtbar.',
    collectNote: 'Es wurde kein Betrag eingezogen — es gibt nichts zu erstatten.',
    itemsTitle: 'Stornierte Artikel',
    reorder: 'Gleiche Bestellung erneut',
    helpTitle: 'Passt die Stornierung nicht?',
    helpText: 'Falls Sie nicht storniert haben oder ein Fehler vorliegt, schreiben Sie uns — Antwort am selben Tag.',
    helpLink: 'Schreiben Sie uns →',
  },
};

export function orderCancelledSubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderCancelledEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];
  const refunded = Boolean(data.refund);

  return (
    <OrderEmailLayout
      preview={t.preview(data.referenceNo, data.refund?.amount ?? null)}
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
      <StatusPill label={t.pill} tone="red" />
      <Headline title={t.title} intro={t.intro(data.referenceNo, refunded)} />
      <StatusBlock tone="red" headline={t.blockHeadline(data.statusAt)} detail={t.blockDetail} />
      {data.refund && (
        <TotalsCard
          title={t.refundTitle}
          totals={[{ label: t.orderAmount, value: data.refund.previousTotal }]}
          grandTotal={{ label: t.refunded, value: data.refund.amount }}
          paymentNote={null}
          footnote={t.refundNote}
        />
      )}
      <PlainListCard title={t.itemsTitle} lines={data.lines} />
      <CtaButton label={t.reorder} url={data.orderUrl} />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </OrderEmailLayout>
  );
}
