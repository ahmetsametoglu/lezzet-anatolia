import * as React from 'react';
import { localizedUrl } from '@lezzet/i18n';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, NoticeCard, EmailLayout, PlainListCard, StatusBlock, StatusPill } from '../components/email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * Kart ödemesi hiç gelmeyen taslağın maili: sipariş oluşmadı, numarası yoktur. İptal mailinin iskeleti; düğme sepete gider, çünkü
 * sepet duruyor ve müşterinin yapacağı tek şey yeniden denemek.
 */

interface Copy {
  pill: string;
  title: string;
  intro: string;
  subject: string;
  preview: string;
  blockHeadline: (at: string | null) => string;
  blockDetail: string;
  itemsTitle: string;
  retry: string;
  helpTitle: string;
  helpText: string;
  helpLink: string;
  /** Ortak alt bilgi sipariş numarası ister; bu mailin numarası yok. */
  footerNotice: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    pill: '● Ödeme tamamlanmadı',
    title: 'Siparişiniz oluşmadı.',
    intro: 'Kartla ödemeniz tamamlanmadığı için siparişiniz oluşturulmadı. Kartınızdan tahsilat yapılmadı.',
    subject: 'Ödemeniz tamamlanmadı — siparişiniz oluşmadı',
    preview: 'Kartınızdan tahsilat yapılmadı; sepetiniz duruyor.',
    blockHeadline: (at) => (at ? `Ödeme alınamadı · ${at}` : 'Ödeme alınamadı'),
    blockDetail: 'Ürünler sepetinizde duruyor. Dilediğiniz zaman başka bir kartla ya da kapıda ödemeyle yeniden deneyebilirsiniz.',
    itemsTitle: 'Sepetinizdeki ürünler',
    retry: 'Sepetime dön',
    helpTitle: 'Ödeme sırasında bir sorun mu yaşadınız?',
    helpText: 'Kartınızdan tutar çekildiğini görüyorsanız ya da ödeme adımı açılmadıysa yazın — aynı gün dönüyoruz.',
    helpLink: 'Bize yazın →',
    footerNotice: 'Bu e-posta tamamlanmayan kart ödemenizle ilgili gönderilmiştir.',
  },
  fr: {
    pill: '● Paiement non abouti',
    title: 'Votre commande n’a pas été créée.',
    intro: 'Votre paiement par carte n’a pas abouti, la commande n’a donc pas été créée. Aucun montant n’a été débité.',
    subject: 'Paiement non abouti — votre commande n’a pas été créée',
    preview: 'Aucun montant n’a été débité ; votre panier est intact.',
    blockHeadline: (at) => (at ? `Paiement non reçu · ${at}` : 'Paiement non reçu'),
    blockDetail: 'Vos articles sont toujours dans votre panier. Vous pouvez réessayer à tout moment avec une autre carte ou le paiement à la livraison.',
    itemsTitle: 'Articles de votre panier',
    retry: 'Retourner au panier',
    helpTitle: 'Un souci pendant le paiement ?',
    helpText: 'Si un montant apparaît sur votre compte ou si l’étape de paiement ne s’est pas ouverte, écrivez-nous — réponse le jour même.',
    helpLink: 'Nous écrire →',
    footerNotice: 'Cet e-mail concerne votre paiement par carte non abouti.',
  },
  de: {
    pill: '● Zahlung nicht abgeschlossen',
    title: 'Ihre Bestellung wurde nicht angelegt.',
    intro: 'Ihre Kartenzahlung wurde nicht abgeschlossen, daher wurde die Bestellung nicht angelegt. Es wurde nichts abgebucht.',
    subject: 'Zahlung nicht abgeschlossen — Ihre Bestellung wurde nicht angelegt',
    preview: 'Es wurde nichts abgebucht; Ihr Warenkorb bleibt erhalten.',
    blockHeadline: (at) => (at ? `Zahlung nicht eingegangen · ${at}` : 'Zahlung nicht eingegangen'),
    blockDetail: 'Ihre Artikel liegen weiter im Warenkorb. Sie können es jederzeit mit einer anderen Karte oder Zahlung bei Lieferung erneut versuchen.',
    itemsTitle: 'Artikel in Ihrem Warenkorb',
    retry: 'Zum Warenkorb',
    helpTitle: 'Gab es ein Problem bei der Zahlung?',
    helpText: 'Falls Ihnen trotzdem ein Betrag abgebucht wurde oder der Zahlungsschritt nicht geöffnet wurde, schreiben Sie uns — Antwort am selben Tag.',
    helpLink: 'Schreiben Sie uns →',
    footerNotice: 'Diese E-Mail betrifft Ihre nicht abgeschlossene Kartenzahlung.',
  },
};

export function orderPaymentIncompleteSubject(data: OrderNotification): string {
  return COPY[data.locale].subject;
}

export function OrderPaymentIncompleteEmail({ data, brandName, postalAddress }: OrderEmailProps) {
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
        notice: t.footerNotice,
        preferencesLabel: shared.preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <StatusPill label={t.pill} tone="amber" />
      <Headline title={t.title} intro={t.intro} />
      <StatusBlock tone="amber" headline={t.blockHeadline(data.statusAt)} detail={t.blockDetail} />
      <PlainListCard title={t.itemsTitle} lines={data.lines} />
      <CtaButton label={t.retry} url={localizedUrl('/cart', data.locale)} />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </EmailLayout>
  );
}
