import * as React from 'react';
import type { PreferredLanguage, ZoneAvailableNotification } from '@lezzet/types';
import { CtaButton, EmailLayout, Headline, NoticeCard } from '../components/email-layout';
import { BRAND_COPY } from './brand-copy';

void React;

/**
 * **Beklenen bölge açıldı** (14.10 · 19.21).
 *
 * ── BU MAİL BİR SÖZÜN KARŞILIĞIDIR ──────────────────────────────────────────
 * Müşteri bir posta kodu için "buraya gelince haber verin" demişti. `zone_notice`'in künyesi o kaydı
 * *"bir söz değil, bir kayıt"* diye tanımlıyordu — çünkü o gün ne bölge kararı vardı ne gönderim.
 * İkisi de artık var; bu mail kaydı söze çeviren şey.
 *
 * ── ÜÇ ŞEY BİLEREK YOK ──────────────────────────────────────────────────────
 * **Künye kartı yok** (`HeaderCard`): sipariş maillerinde referans numarası vardır, burada
 * gösterilecek bir kayıt yok — posta kodu zaten başlıkta.
 * **Tarih yok:** "ne zaman gelmeye başlıyoruz" sorusunun cevabı rota gününe bağlı ve rota
 * değişebilir; mailde bir gün yazmak tutulamayabilecek bir söz olurdu. Müşteri katalogda kendi
 * gününü seçiyor.
 * **İkinci bağlantı yok:** tek eylem, tek buton (davet mailiyle aynı kural) — ikinci bir bağlantı
 * tıklamayı böler.
 *
 * ── ADSIZ ALICI NORMALDİR ───────────────────────────────────────────────────
 * `zone_notice` ziyaretçiden de kayıt alıyor, yani çoğu satırda yalnız e-posta var. Başlık adsız
 * hâli de doğal karşılıyor; "Değerli müşterimiz" gibi bir doldurma kullanılmadı — kimseye ait
 * olmayan bir hitap, hitapsızlıktan soğuktur.
 */

export interface ZoneAvailableEmailProps {
  data: ZoneAvailableNotification;
  brandName: string;
  postalAddress: string;
}

interface Copy {
  preview: (postalCode: string) => string;
  subject: (postalCode: string) => string;
  title: (name: string | null, postalCode: string) => string;
  intro: string;
  cta: string;
  noticeTitle: string;
  noticeText: string;
  footerNotice: (postalCode: string) => string;
}

/** Metin müşterinin dilinde. Dil kayıttan gelir — kodu hangi dildeki sayfada bıraktıysa o. */
const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    preview: (postalCode) => `${postalCode} artık teslimat bölgemizde.`,
    subject: (postalCode) => `${postalCode} için iyi haber`,
    title: (name, postalCode) => (name ? `${name}, ${postalCode} artık bölgemizde` : `${postalCode} artık bölgemizde`),
    intro:
      'Haber vermemizi istediğiniz posta koduna artık teslimat yapıyoruz. Katalogda adresinizi seçtiğinizde uygun teslimat günlerini göreceksiniz.',
    cta: 'Alışverişe başla',
    noticeTitle: 'Bir kez haber veriyoruz',
    noticeText:
      'Bu hatırlatmayı yalnız bir kez gönderiyoruz — kaydınız burada kapanır. Bölge bilgisi değişirse yeniden haber almak için katalogdan tekrar kayıt bırakabilirsiniz.',
    footerNotice: (postalCode) => `Bu e-posta ${postalCode} için bıraktığınız haber kaydı üzerine gönderilmiştir.`,
  },
  fr: {
    preview: (postalCode) => `${postalCode} fait désormais partie de notre zone de livraison.`,
    subject: (postalCode) => `Bonne nouvelle pour le ${postalCode}`,
    title: (name, postalCode) =>
      name ? `${name}, nous livrons désormais le ${postalCode}` : `Nous livrons désormais le ${postalCode}`,
    intro:
      'Nous livrons désormais le code postal pour lequel vous souhaitiez être prévenu·e. En choisissant votre adresse dans le catalogue, vous verrez les jours de livraison disponibles.',
    cta: 'Découvrir le catalogue',
    noticeTitle: 'Un seul message',
    noticeText:
      'Nous n’envoyons ce rappel qu’une seule fois — votre demande s’arrête ici. Si la zone évolue, vous pouvez à nouveau demander à être prévenu·e depuis le catalogue.',
    footerNotice: (postalCode) => `Cet e-mail fait suite à votre demande d’information pour le ${postalCode}.`,
  },
  de: {
    preview: (postalCode) => `${postalCode} liegt jetzt in unserem Liefergebiet.`,
    subject: (postalCode) => `Gute Nachrichten für ${postalCode}`,
    title: (name, postalCode) => (name ? `${name}, wir liefern jetzt nach ${postalCode}` : `Wir liefern jetzt nach ${postalCode}`),
    intro:
      'Wir liefern jetzt an die Postleitzahl, für die Sie benachrichtigt werden wollten. Wenn Sie im Katalog Ihre Adresse wählen, sehen Sie die verfügbaren Liefertage.',
    cta: 'Zum Katalog',
    noticeTitle: 'Nur eine Nachricht',
    noticeText:
      'Diese Erinnerung senden wir nur einmal — Ihre Anfrage endet hier. Ändert sich das Liefergebiet, können Sie sich im Katalog erneut benachrichtigen lassen.',
    footerNotice: (postalCode) => `Diese E-Mail bezieht sich auf Ihre Benachrichtigungsanfrage für ${postalCode}.`,
  },
};

export function zoneAvailableSubject(data: ZoneAvailableNotification): string {
  return COPY[data.locale].subject(data.postalCode);
}

export function ZoneAvailableEmail({ data, brandName, postalAddress }: ZoneAvailableEmailProps) {
  const t = COPY[data.locale];

  return (
    <EmailLayout
      preview={t.preview(data.postalCode)}
      locale={data.locale}
      brandName={brandName}
      region={BRAND_COPY[data.locale].region}
      footer={{
        address: postalAddress,
        notice: t.footerNotice(data.postalCode),
        preferencesLabel: BRAND_COPY[data.locale].preferences,
        preferencesUrl: data.notificationPreferencesUrl,
      }}
    >
      <Headline title={t.title(data.customerName, data.postalCode)} intro={t.intro} />
      <CtaButton label={t.cta} url={data.catalogUrl} />
      <NoticeCard title={t.noticeTitle} text={t.noticeText} />
    </EmailLayout>
  );
}
