import * as React from 'react';
import type { B2bApplicationResultNotification, PreferredLanguage } from '@lezzet/types';
import { CtaButton, EmailLayout, Headline, NoticeCard } from '../components/email-layout';
import { BRAND_COPY } from './brand-copy';

void React;

/**
 * **B2B başvuru sonucu** — onay ya da ret (14.10).
 *
 * ── KAPATTIĞI BOŞLUK ────────────────────────────────────────────────────────
 * Ret gerekçesi veride ZORUNLU ve 20.2 onu üç dile çeviriyordu; ama gerekçeyi okuyan kimse yoktu.
 * Görev künyesi *"müşteriye e-postayla gidiyor"* diyordu — öyle bir şablon hiç yazılmamıştı
 * (müşteri şeridinin ölçümü, 04.08). Yani zorunlu tutulan, çevrilen ve saklanan bir cümle hiçbir
 * yere ulaşmıyordu.
 *
 * ── TEK ŞABLON, İKİ SONUÇ ───────────────────────────────────────────────────
 * Onay ile ret ayrı şablon değil: alıcı aynı, kanal aynı, tetikleyen aynı karar. İki dosya olsaydı
 * marka iskeleti iki kez yazılır ve biri gün gelip ötekinden ayrışırdı. Ayrım tek bayrakta
 * (`approved`) ve metin kümesinde.
 *
 * ── RETTE TON: KAPI KAPANMIYOR ──────────────────────────────────────────────
 * Reddedilen başvurunun sahibi çoğu zaman gerçek bir işletmedir ve eksik olan genelde bir belgedir.
 * Metin bu yüzden "başvurunuz reddedildi" demiyor, **neyin eksik olduğunu** söylüyor ve yeniden
 * başvurunun açık olduğunu yazıyor. Gerekçe kutusu da bu yüzden var: gerekçesiz bir ret, müşteriye
 * ne yapacağını söylemeyen bir kapıdır.
 *
 * **Ret metninde bireysel alışverişten söz ediliyor** çünkü hesap kapanmıyor: B2B onayı olmayan
 * kullanıcı vitrini perakende fiyatlarla görmeye devam eder.
 */

export interface B2bApplicationResultEmailProps {
  data: B2bApplicationResultNotification;
  brandName: string;
  postalAddress: string;
}

interface Copy {
  previewApproved: string;
  previewRejected: string;
  subjectApproved: string;
  subjectRejected: string;
  titleApproved: (who: string | null) => string;
  titleRejected: (who: string | null) => string;
  introApproved: string;
  introRejected: string;
  ctaApproved: string;
  ctaRejected: string;
  reasonTitle: string;
  noticeApprovedTitle: string;
  noticeApprovedText: string;
  noticeRejectedTitle: string;
  noticeRejectedText: string;
  footerNotice: string;
}

const COPY: Record<PreferredLanguage, Copy> = {
  tr: {
    previewApproved: 'Toptan hesabınız açıldı.',
    previewRejected: 'Başvurunuz hakkında bir güncelleme var.',
    subjectApproved: 'Toptan hesabınız açıldı',
    subjectRejected: 'Toptan başvurunuz hakkında',
    titleApproved: (who) => (who ? `${who} için toptan hesap açıldı` : 'Toptan hesabınız açıldı'),
    titleRejected: (who) => (who ? `${who} başvurusu için bir eksik var` : 'Başvurunuz için bir eksik var'),
    introApproved:
      'Toptan başvurunuz onaylandı. Bundan sonra vitrinde toptan fiyatları ve işletmelere özel asgari sipariş koşullarını göreceksiniz.',
    introRejected:
      'Başvurunuzu inceledik ve şu hâliyle onaylayamadık. Aşağıdaki nokta tamamlanırsa yeniden başvurabilirsiniz — hesabınız açık kalıyor.',
    ctaApproved: 'Toptan vitrine git',
    ctaRejected: 'Hesabıma git',
    reasonTitle: 'Eksik olan',
    noticeApprovedTitle: 'Faturalandırma',
    noticeApprovedText:
      'Vergi numaranız geçerliyse Fransa dışı işletme siparişlerinde KDV ters ibraz (autoliquidation) uygulanır; faturada bu ibare yer alır.',
    noticeRejectedTitle: 'Yeniden başvurabilirsiniz',
    noticeRejectedText:
      'Eksiği tamamladıktan sonra aynı sayfadan yeniden başvurmanız yeterli. O zamana kadar bireysel alışverişinize devam edebilirsiniz.',
    footerNotice: 'Bu e-posta toptan (B2B) başvurunuz hakkında gönderilmiştir.',
  },
  fr: {
    previewApproved: 'Votre compte professionnel est ouvert.',
    previewRejected: 'Une mise à jour concernant votre demande.',
    subjectApproved: 'Votre compte professionnel est ouvert',
    subjectRejected: 'À propos de votre demande professionnelle',
    titleApproved: (who) => (who ? `Compte professionnel ouvert pour ${who}` : 'Votre compte professionnel est ouvert'),
    titleRejected: (who) => (who ? `Il manque un élément au dossier ${who}` : 'Il manque un élément à votre demande'),
    introApproved:
      'Votre demande professionnelle est validée. Vous verrez désormais les tarifs professionnels et les conditions de commande minimum réservées aux entreprises.',
    introRejected:
      'Nous avons examiné votre demande et ne pouvons pas la valider en l’état. Une fois le point ci-dessous complété, vous pouvez la renouveler — votre compte reste actif.',
    ctaApproved: 'Voir les tarifs professionnels',
    ctaRejected: 'Accéder à mon compte',
    reasonTitle: 'Ce qui manque',
    noticeApprovedTitle: 'Facturation',
    noticeApprovedText:
      'Si votre numéro de TVA est valide, l’autoliquidation s’applique aux commandes professionnelles hors de France ; la mention figure sur la facture.',
    noticeRejectedTitle: 'Vous pouvez renouveler votre demande',
    noticeRejectedText:
      'Une fois l’élément complété, il suffit de refaire la demande depuis la même page. D’ici là, vos achats particuliers restent possibles.',
    footerNotice: 'Cet e-mail concerne votre demande de compte professionnel (B2B).',
  },
  de: {
    previewApproved: 'Ihr Geschäftskonto ist freigeschaltet.',
    previewRejected: 'Eine Aktualisierung zu Ihrem Antrag.',
    subjectApproved: 'Ihr Geschäftskonto ist freigeschaltet',
    subjectRejected: 'Zu Ihrem Geschäftskundenantrag',
    titleApproved: (who) => (who ? `Geschäftskonto für ${who} freigeschaltet` : 'Ihr Geschäftskonto ist freigeschaltet'),
    titleRejected: (who) => (who ? `Im Antrag von ${who} fehlt etwas` : 'In Ihrem Antrag fehlt etwas'),
    introApproved:
      'Ihr Geschäftskundenantrag wurde bestätigt. Ab sofort sehen Sie Großhandelspreise und die Mindestbestellbedingungen für Unternehmen.',
    introRejected:
      'Wir haben Ihren Antrag geprüft und können ihn so noch nicht bestätigen. Sobald der folgende Punkt ergänzt ist, können Sie ihn erneut stellen — Ihr Konto bleibt bestehen.',
    ctaApproved: 'Zu den Großhandelspreisen',
    ctaRejected: 'Zu meinem Konto',
    reasonTitle: 'Was fehlt',
    noticeApprovedTitle: 'Rechnungsstellung',
    noticeApprovedText:
      'Bei gültiger USt-IdNr. gilt für Geschäftsbestellungen außerhalb Frankreichs das Reverse-Charge-Verfahren; der Hinweis erscheint auf der Rechnung.',
    noticeRejectedTitle: 'Sie können erneut beantragen',
    noticeRejectedText:
      'Nach Ergänzung genügt ein erneuter Antrag über dieselbe Seite. Bis dahin können Sie weiterhin privat einkaufen.',
    footerNotice: 'Diese E-Mail betrifft Ihren Geschäftskundenantrag (B2B).',
  },
};

export function b2bApplicationResultSubject(data: B2bApplicationResultNotification): string {
  const t = COPY[data.locale];
  return data.approved ? t.subjectApproved : t.subjectRejected;
}

export function B2bApplicationResultEmail({ data, brandName, postalAddress }: B2bApplicationResultEmailProps) {
  const t = COPY[data.locale];
  const who = data.companyName ?? data.customerName;

  return (
    <EmailLayout
      preview={data.approved ? t.previewApproved : t.previewRejected}
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
      <Headline
        title={data.approved ? t.titleApproved(who) : t.titleRejected(who)}
        intro={data.approved ? t.introApproved : t.introRejected}
      />
      {/* Gerekçe kutusu YALNIZ rette ve YALNIZ gerekçe varsa: boş bir "Eksik olan" başlığı,
          cevapsız bir sorudan kötüdür. */}
      {!data.approved && data.reason ? <NoticeCard title={t.reasonTitle} text={data.reason} /> : null}
      <CtaButton label={data.approved ? t.ctaApproved : t.ctaRejected} url={data.actionUrl} />
      <NoticeCard
        title={data.approved ? t.noticeApprovedTitle : t.noticeRejectedTitle}
        text={data.approved ? t.noticeApprovedText : t.noticeRejectedText}
      />
    </EmailLayout>
  );
}
