import * as React from 'react';
import type { OrderNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, Headline, InfoBlock, ItemsCard, NoticeCard, OrderEmailLayout, OrderHeaderCard, StatusPill, Timeline, TotalsCard } from '../components/order-email-layout';
import { SHARED_COPY } from './order-copy';
import type { OrderEmailProps } from './order-confirmed';

void React;

/**
 * **Yola çıktı** (14.5) — kurye rotaya çıkınca. `design/project/Email - Siparis Yolda.html`.
 *
 * Sorusu değişir: "ne aldım?" değil, "**ne geliyor ve ne zaman?**". Bu yüzden kalem listesi
 * fiyat değil GİDEN ADET gösterir, tutar kartı da tek satıra iner (güncel toplam) — eksik çıkan
 * kalem varsa fark burada görünür.
 *
 * Kargolu siparişte kurye penceresi yerine takip numarası + bağlantı konur (tasarım kuralı).
 */

interface Copy {
  pill: string;
  status: string;
  title: string;
  intro: (window: string | null) => React.ReactNode;
  subject: (referenceNo: string) => string;
  preview: (window: string | null) => string;
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
    intro: (window) => (
      <>
        {window ? (
          <>
            Kurye bugün <strong style={{ color: '#3a4147' }}>{window}</strong> arasında kapınızda olacak.{' '}
          </>
        ) : (
          <>Siparişiniz gönderildi. </>
        )}
        Teslimatta kimsenin bulunmayacağını düşünüyorsanız bize yazın, günü değiştirelim.
      </>
    ),
    subject: (ref) => `Siparişiniz yolda — ${ref}`,
    preview: (window) => (window ? `Kurye bugün ${window} arasında kapınızda.` : 'Siparişiniz yola çıktı.'),
    track: 'Siparişi takip et',
    helpTitle: 'Teslimat için müsait değil misiniz?',
    helpText: 'Kurye çıkmadan önce adres ya da gün değişikliği yapabiliriz. Bize yazmanız yeterli.',
    helpLink: 'Bize yazın →',
  },
  fr: {
    pill: '● En route',
    status: '● En route',
    title: 'Votre commande est en route.',
    intro: (window) => (
      <>
        {window ? (
          <>
            Le livreur sera chez vous aujourd’hui entre <strong style={{ color: '#3a4147' }}>{window}</strong>.{' '}
          </>
        ) : (
          <>Votre commande a été expédiée. </>
        )}
        Si personne ne peut réceptionner, écrivez-nous : nous décalons le jour.
      </>
    ),
    subject: (ref) => `Votre commande est en route — ${ref}`,
    preview: (window) => (window ? `Le livreur passe aujourd’hui entre ${window}.` : 'Votre commande est en route.'),
    track: 'Suivre ma commande',
    helpTitle: 'Vous n’êtes pas disponible ?',
    helpText: 'Avant le départ du livreur, nous pouvons changer l’adresse ou le jour. Un message suffit.',
    helpLink: 'Nous écrire →',
  },
  de: {
    pill: '● Unterwegs',
    status: '● Unterwegs',
    title: 'Ihre Bestellung ist unterwegs.',
    intro: (window) => (
      <>
        {window ? (
          <>
            Der Kurier ist heute zwischen <strong style={{ color: '#3a4147' }}>{window}</strong> bei Ihnen.{' '}
          </>
        ) : (
          <>Ihre Bestellung wurde versandt. </>
        )}
        Falls niemand da ist, schreiben Sie uns — wir verschieben den Tag.
      </>
    ),
    subject: (ref) => `Ihre Bestellung ist unterwegs — ${ref}`,
    preview: (window) => (window ? `Der Kurier kommt heute zwischen ${window}.` : 'Ihre Bestellung ist unterwegs.'),
    track: 'Bestellung verfolgen',
    helpTitle: 'Sind Sie nicht da?',
    helpText: 'Vor der Abfahrt des Kuriers können wir Adresse oder Tag ändern. Eine Nachricht genügt.',
    helpLink: 'Schreiben Sie uns →',
  },
};

export function orderOutForDeliverySubject(data: OrderNotification): string {
  return COPY[data.locale].subject(data.referenceNo);
}

export function OrderOutForDeliveryEmail({ data, brandName, postalAddress }: OrderEmailProps) {
  const t = COPY[data.locale];
  const shared = SHARED_COPY[data.locale];
  const window = data.delivery?.headline ?? null;

  return (
    <OrderEmailLayout
      preview={t.preview(window)}
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
      <Headline title={t.title} intro={t.intro(window)} />
      <OrderHeaderCard referenceNo={data.referenceNo} orderedOn={data.orderedOn} statusLabel={t.status} />
      <Timeline steps={data.steps} labels={shared.steps} />
      {/* Kargoda kurye penceresi yoktur: yerine takip numarası + bağlantı (tasarım kuralı). */}
      {data.tracking ? (
        <InfoBlock icon="📦" headline={data.tracking.number} detail={<a href={data.tracking.url} style={{ color: '#5f7a2c' }}>{data.tracking.url}</a>} />
      ) : (
        data.delivery && <InfoBlock icon={data.delivery.icon} headline={data.delivery.headline} detail={data.delivery.detail} />
      )}
      <ItemsCard title={shared.sentItemsTitle} lines={data.lines} />
      <TotalsCard title={shared.totalsTitle} totals={[]} grandTotal={data.grandTotal} paymentNote={data.paymentNote} />
      <CtaButton label={t.track} url={data.orderUrl} />
      <NoticeCard title={t.helpTitle} text={t.helpText} linkLabel={t.helpLink} linkUrl={data.supportUrl} />
    </OrderEmailLayout>
  );
}
