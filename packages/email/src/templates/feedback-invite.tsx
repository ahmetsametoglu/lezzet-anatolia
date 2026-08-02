import * as React from 'react';
import type { FeedbackInviteNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, EmailLayout, HeaderCard, Headline, NoticeCard } from '../components/email-layout';
import { BRAND_COPY } from './brand-copy';

void React;

/**
 * Alım-sonrası değerlendirme daveti (17.2) — DOMAIN §14, `design/pages/musteri-geri-bildirim.md`.
 *
 * **Ayrı bir çizimi yok** (`design/project`'te `Email - Değerlendirme` bulunmuyor); talep mailiyle
 * aynı yol izlenir: marka iskeleti ve mevcut bloklar aynen kullanılır, yeni bir görsel öğe
 * UYDURULMAZ. Kullanılan dördü de sipariş maillerinden geliyor — künye kartı, başlık, tek yeşil
 * buton, krem davet kutusu.
 *
 * **Tek eylem, tek buton.** Davetin işi bir şey anlatmak değil, bir kapı açmak; ikinci bir bağlantı
 * (katalog, hesap, kampanya) koymak tıklamayı böler. Alt bilgideki tercih bağlantısı bunun dışında
 * çünkü o bir eylem değil, yasal bir çıkış.
 *
 * **Puan sayısı yazılmaz.** Puan tamamlamada verilir ve verilip verilmeyeceği o anki günlük tavana
 * ve müşteri türüne bağlıdır (B2B kazanmaz). Davette bir sayı yazmak tutulamayabilecek bir sözdür;
 * ödülün varlığından söz edilir, miktarından değil.
 */

export interface FeedbackInviteEmailProps {
  data: FeedbackInviteNotification;
  brandName: string;
  postalAddress: string;
}

interface Copy {
  preview: (reference: string) => string;
  subject: string;
  title: (name: string | null) => string;
  intro: (count: number) => string;
  orderMeta: (deliveredOn: string) => string;
  statusLabel: string;
  cta: string;
  rewardTitle: string;
  rewardText: string;
  notice: (reference: string) => string;
}

/**
 * Metin müşterinin dilinde (DOMAIN §10). Dil siparişten gelir, profilden değil — müşteri o siparişi
 * hangi dilde verdiyse davetini de o dilde okur.
 */
const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    preview: (reference) => `${reference} numaralı siparişinizi değerlendirir misiniz?`,
    subject: 'Aldıklarınız nasıldı?',
    title: (name) => (name ? `${name}, aldıklarınız nasıldı?` : 'Aldıklarınız nasıldı?'),
    intro: (count) =>
      count === 1
        ? 'Siparişinizdeki ürünü beğendiniz mi? Tek dokunuşla söylemeniz yeterli — bir dakikadan kısa sürer.'
        : `Siparişinizdeki ${count} ürünü beğenip beğenmediğinizi tek tek işaretleyebilirsiniz — birkaç dakikadan kısa sürer.`,
    orderMeta: (deliveredOn) => `${deliveredOn} tarihinde teslim edildi`,
    statusLabel: 'Teslim edildi',
    cta: 'Değerlendirmeye başla',
    rewardTitle: 'Görüşünüz bize yol gösteriyor',
    rewardText:
      'Hangi ürünün tuttuğunu sizden öğreniyoruz — sonraki seçkiyi buna göre kuruyoruz. Katıldığınız için hesabınıza puan da yazılır.',
    notice: (reference) => `Bu e-posta ${reference} numaralı siparişinizle ilgili gönderilmiştir.`,
  },
  fr: {
    preview: (reference) => `Donnez votre avis sur la commande ${reference}`,
    subject: 'Vos produits vous ont-ils plu ?',
    title: (name) => (name ? `${name}, vos produits vous ont-ils plu ?` : 'Vos produits vous ont-ils plu ?'),
    intro: (count) =>
      count === 1
        ? 'Le produit de votre commande vous a-t-il plu ? Un seul geste suffit — cela prend moins d’une minute.'
        : `Dites-nous si les ${count} produits de votre commande vous ont plu — cela prend moins de quelques minutes.`,
    orderMeta: (deliveredOn) => `livrée le ${deliveredOn}`,
    statusLabel: 'Livrée',
    cta: 'Donner mon avis',
    rewardTitle: 'Votre avis nous guide',
    rewardText:
      'C’est vous qui nous dites ce qui vaut la peine — la prochaine sélection se construit là-dessus. Votre participation vous rapporte aussi des points.',
    notice: (reference) => `Cet e-mail concerne votre commande ${reference}.`,
  },
  de: {
    preview: (reference) => `Bewerten Sie Ihre Bestellung ${reference}`,
    subject: 'Wie waren Ihre Produkte?',
    title: (name) => (name ? `${name}, wie waren Ihre Produkte?` : 'Wie waren Ihre Produkte?'),
    intro: (count) =>
      count === 1
        ? 'Hat Ihnen das Produkt aus Ihrer Bestellung gefallen? Ein Tippen genügt — es dauert weniger als eine Minute.'
        : `Sagen Sie uns, ob Ihnen die ${count} Produkte Ihrer Bestellung gefallen haben — es dauert nur wenige Minuten.`,
    orderMeta: (deliveredOn) => `am ${deliveredOn} zugestellt`,
    statusLabel: 'Zugestellt',
    cta: 'Jetzt bewerten',
    rewardTitle: 'Ihre Meinung zeigt uns den Weg',
    rewardText:
      'Sie sagen uns, was sich lohnt — danach stellen wir die nächste Auswahl zusammen. Für Ihre Teilnahme gibt es außerdem Punkte.',
    notice: (reference) => `Diese E-Mail betrifft Ihre Bestellung ${reference}.`,
  },
};

/** Davet mailinin konu başlığı (müşterinin dilinde). */
export function feedbackInviteSubject(data: FeedbackInviteNotification): string {
  return COPY[data.locale].subject;
}

export function FeedbackInviteEmail({ data, brandName, postalAddress }: FeedbackInviteEmailProps) {
  const t = COPY[data.locale];

  return (
    <EmailLayout
      preview={t.preview(data.orderReferenceNo)}
      locale={data.locale}
      brandName={brandName}
      region={BRAND_COPY[data.locale].region}
      footer={{
        address: postalAddress,
        notice: t.notice(data.orderReferenceNo),
        preferencesLabel: BRAND_COPY[data.locale].preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <Headline title={t.title(data.customerName)} intro={t.intro(data.productCount)} />
      <HeaderCard title={data.orderReferenceNo} meta={t.orderMeta(data.deliveredOn)} statusLabel={t.statusLabel} />
      <CtaButton label={t.cta} url={data.feedbackUrl} />
      <NoticeCard title={t.rewardTitle} text={t.rewardText} />
    </EmailLayout>
  );
}
