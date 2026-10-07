import * as React from 'react';
import type { MarketingSubscribedNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, EmailLayout, Headline } from '../components/email-layout';
import { BRAND_COPY } from './brand-copy';

void React;

/**
 * Kampanya e-postası açılınca abone olana gider: izni kim açtıysa açsın adresin sahibi haberdar olur. Onay istemez; tek düğme
 * aboneliği hemen sonlandırır.
 */

export interface MarketingSubscribedEmailProps {
  data: MarketingSubscribedNotification;
  brandName: string;
  postalAddress: string;
}

interface Copy {
  preview: string;
  subject: string;
  title: (name: string | null) => string;
  intro: string;
  cta: string;
  footerNotice: string;
}

/** Sözler müşterinin izni verdiği yerdekilerle aynı: hesapta "Kampanya iletişimi", ödemede "kampanya ve yeni ürünler". */
const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    preview: 'Kampanya e-postalarımıza abone oldunuz.',
    subject: 'Kampanya e-postalarına abone oldunuz',
    title: (name) => (name ? `${name}, kampanya e-postalarına abone oldunuz` : 'Kampanya e-postalarına abone oldunuz'),
    intro:
      'Kampanyalarımızı ve yeni ürünlerimizi bundan sonra bu adrese e-postayla göndereceğiz. Abone olan siz değilseniz ya da vazgeçtiyseniz aşağıdaki düğmeyle aboneliği hemen sonlandırabilirsiniz.',
    cta: 'Aboneliği sonlandır',
    footerNotice: 'Bu e-posta, hesabınızda kampanya e-postaları açıldığı için gönderilmiştir.',
  },
  fr: {
    preview: 'Vous recevrez désormais nos offres et nouveautés par e-mail.',
    subject: 'Vos communications commerciales par e-mail',
    title: (name) => (name ? `${name}, vous recevrez désormais nos offres` : 'Vous recevrez désormais nos offres'),
    intro:
      'Nos offres et nos nouveautés vous parviendront désormais à cette adresse. Si cette inscription ne vient pas de vous, ou si vous avez changé d’avis, le bouton ci-dessous y met fin immédiatement.',
    cta: 'Me désinscrire',
    footerNotice: 'Vous recevez cet e-mail car les communications commerciales par e-mail ont été activées sur votre compte.',
  },
  de: {
    preview: 'Sie erhalten jetzt unsere Angebote und Neuheiten per E-Mail.',
    subject: 'Ihre Werbenachrichten per E-Mail',
    title: (name) => (name ? `${name}, Sie erhalten jetzt unsere Angebote` : 'Sie erhalten jetzt unsere Angebote'),
    intro:
      'Angebote und Neuheiten schicken wir Ihnen ab jetzt an diese Adresse. Falls die Anmeldung nicht von Ihnen stammt oder Sie es sich anders überlegt haben, beenden Sie sie mit der Schaltfläche unten sofort.',
    cta: 'Abmelden',
    footerNotice: 'Sie erhalten diese E-Mail, weil in Ihrem Konto Werbenachrichten per E-Mail aktiviert wurden.',
  },
};

export function marketingSubscribedSubject(data: MarketingSubscribedNotification): string {
  return COPY[data.locale].subject;
}

export function MarketingSubscribedEmail({ data, brandName, postalAddress }: MarketingSubscribedEmailProps) {
  const t = COPY[data.locale];

  return (
    <EmailLayout
      preview={t.preview}
      locale={data.locale}
      brandName={brandName}
      region={BRAND_COPY[data.locale].region}
      footer={{
        address: postalAddress,
        notice: t.footerNotice,
        preferencesLabel: BRAND_COPY[data.locale].preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <Headline title={t.title(data.customerName)} intro={t.intro} />
      <CtaButton label={t.cta} url={data.unsubscribeUrl} />
    </EmailLayout>
  );
}
