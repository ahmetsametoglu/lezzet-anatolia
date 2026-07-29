import type { PreferredLanguage, TicketStatus, TicketType } from '@lezzet/types';

/**
 * Talep e-postalarının metinleri, üç dilde (14.7) — müşterinin `preferred_language`'ı.
 *
 * Operasyon yüzeyi Türkçedir ama bu mail MÜŞTERİYE gider; dil onun tercihidir (DOMAIN §10).
 *
 * **Durum ve tip sözlüğü burada, kapıda değil:** kapı ham enum geçirir. Etiketi kapı üretseydi
 * aynı sözlük hem `apps/web` hem şablon tarafında dururdu ve biri güncellenmeyi unuturdu.
 */

interface TicketCopy {
  region: string;
  /** Konu satırları — biri cevap, biri durum değişimi. */
  repliedSubject: (ref: string) => string;
  resolvedSubject: (ref: string) => string;
  reopenedSubject: (ref: string) => string;

  repliedTitle: string;
  repliedIntro: string;
  resolvedTitle: string;
  resolvedIntro: string;
  reopenedTitle: string;
  reopenedIntro: string;

  /** Talep künyesi kartı. */
  requestLabel: string;
  openedOn: (date: string) => string;
  orderLine: (referenceNo: string) => string;
  replyCardTitle: string;
  cta: string;

  /** Kapanmış talebe hâlâ yazılabildiğini söyleyen krem kart — sessiz bir kapı bırakmamak için. */
  stillOpenTitle: string;
  stillOpenText: string;

  types: Record<TicketType, string>;
  statuses: Record<TicketStatus, string>;

  footerNotice: string;
  preferences: string;
}

export const TICKET_COPY: Record<PreferredLanguage, TicketCopy> = {
  tr: {
    region: 'Strasbourg & çevresi',
    repliedSubject: (ref) => `Talebinize cevap verdik — ${ref}`,
    resolvedSubject: (ref) => `Talebiniz çözüldü — ${ref}`,
    reopenedSubject: (ref) => `Talebiniz yeniden açıldı — ${ref}`,

    repliedTitle: 'Talebinize cevap verdik',
    repliedIntro: 'Ekibimiz talebinizi yanıtladı. Cevabın tamamı aşağıda; dilerseniz aynı yerden yazmaya devam edebilirsiniz.',
    resolvedTitle: 'Talebiniz çözüldü',
    resolvedIntro: 'Talebinizi çözüldü olarak işaretledik. Sorun devam ediyorsa yazmanız yeterli — talep kendiliğinden yeniden açılır.',
    reopenedTitle: 'Talebiniz yeniden açıldı',
    reopenedIntro: 'Talebiniz yeniden açıldı ve ekibimizin sırasına girdi.',

    requestLabel: 'Talep',
    openedOn: (date) => `${date} tarihinde açıldı`,
    orderLine: (referenceNo) => `${referenceNo} numaralı siparişle ilgili`,
    replyCardTitle: 'Cevabımız',
    cta: 'Talebimi görüntüle',

    stillOpenTitle: 'Sorun devam ediyor mu?',
    stillOpenText: 'Aynı talebe yazmanız yeterli; kapanmış olsa bile mesajınızla birlikte yeniden açılır ve kaldığımız yerden devam ederiz.',

    types: { damaged: 'Hasarlı ürün', missing: 'Eksik ürün', question: 'Soru', other: 'Diğer' },
    statuses: { open: 'Açık', in_progress: 'İnceleniyor', resolved: 'Çözüldü' },

    footerNotice: 'Bu e-posta açtığınız talep hakkında gönderilmiştir.',
    preferences: 'Bildirim tercihleri',
  },
  fr: {
    region: 'Strasbourg & environs',
    repliedSubject: (ref) => `Nous avons répondu à votre demande — ${ref}`,
    resolvedSubject: (ref) => `Votre demande est résolue — ${ref}`,
    reopenedSubject: (ref) => `Votre demande a été rouverte — ${ref}`,

    repliedTitle: 'Nous avons répondu à votre demande',
    repliedIntro: 'Notre équipe a répondu à votre demande. La réponse complète figure ci-dessous ; vous pouvez continuer à écrire au même endroit.',
    resolvedTitle: 'Votre demande est résolue',
    resolvedIntro: 'Nous avons marqué votre demande comme résolue. Si le problème persiste, écrivez-nous — la demande se rouvre automatiquement.',
    reopenedTitle: 'Votre demande a été rouverte',
    reopenedIntro: 'Votre demande a été rouverte et se trouve à nouveau dans la file de notre équipe.',

    requestLabel: 'Demande',
    openedOn: (date) => `Ouverte le ${date}`,
    orderLine: (referenceNo) => `Concerne la commande ${referenceNo}`,
    replyCardTitle: 'Notre réponse',
    cta: 'Voir ma demande',

    stillOpenTitle: 'Le problème persiste ?',
    stillOpenText: 'Écrivez simplement sur la même demande ; même close, elle se rouvre avec votre message et nous reprenons où nous en étions.',

    types: { damaged: 'Produit abîmé', missing: 'Produit manquant', question: 'Question', other: 'Autre' },
    statuses: { open: 'Ouverte', in_progress: 'En cours', resolved: 'Résolue' },

    footerNotice: 'Cet e-mail concerne la demande que vous avez ouverte.',
    preferences: 'Préférences de notification',
  },
  de: {
    region: 'Straßburg & Umgebung',
    repliedSubject: (ref) => `Wir haben auf Ihre Anfrage geantwortet — ${ref}`,
    resolvedSubject: (ref) => `Ihre Anfrage ist gelöst — ${ref}`,
    reopenedSubject: (ref) => `Ihre Anfrage wurde wieder geöffnet — ${ref}`,

    repliedTitle: 'Wir haben auf Ihre Anfrage geantwortet',
    repliedIntro: 'Unser Team hat Ihre Anfrage beantwortet. Die vollständige Antwort finden Sie unten; Sie können an derselben Stelle weiterschreiben.',
    resolvedTitle: 'Ihre Anfrage ist gelöst',
    resolvedIntro: 'Wir haben Ihre Anfrage als gelöst markiert. Besteht das Problem weiterhin, schreiben Sie uns — die Anfrage wird automatisch wieder geöffnet.',
    reopenedTitle: 'Ihre Anfrage wurde wieder geöffnet',
    reopenedIntro: 'Ihre Anfrage wurde wieder geöffnet und steht erneut in der Warteschlange unseres Teams.',

    requestLabel: 'Anfrage',
    openedOn: (date) => `Eröffnet am ${date}`,
    orderLine: (referenceNo) => `Betrifft Bestellung ${referenceNo}`,
    replyCardTitle: 'Unsere Antwort',
    cta: 'Meine Anfrage ansehen',

    stillOpenTitle: 'Besteht das Problem weiterhin?',
    stillOpenText: 'Schreiben Sie einfach in dieselbe Anfrage; auch eine geschlossene Anfrage wird mit Ihrer Nachricht wieder geöffnet und wir machen dort weiter, wo wir aufgehört haben.',

    types: { damaged: 'Beschädigter Artikel', missing: 'Fehlender Artikel', question: 'Frage', other: 'Sonstiges' },
    statuses: { open: 'Offen', in_progress: 'In Bearbeitung', resolved: 'Gelöst' },

    footerNotice: 'Diese E-Mail betrifft die von Ihnen eröffnete Anfrage.',
    preferences: 'Benachrichtigungseinstellungen',
  },
};

/**
 * Mailde talebin künyesi — talebin referans numarası YOKTUR (tasarım kararı: talep bir belge değil,
 * bir konuşmadır). Müşterinin tanıyacağı şey başlığıdır; başlık yoksa tip etiketine düşülür.
 */
export function ticketLabel(data: { subject: string | null; type: TicketType }, locale: PreferredLanguage): string {
  const copy = TICKET_COPY[locale];
  const subject = data.subject?.trim();
  return subject && subject.length > 0 ? subject : copy.types[data.type];
}
