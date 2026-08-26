import type { Locale } from '@lezzet/i18n';
import type { AppNotificationKind } from '@lezzet/types';

import type { NotificationRow } from '@/lib/api/notifications';

/*
  BİLDİRİM CÜMLESİ EKRANDA KURULUR (14.12 kararı) — satır metin taşımaz: `kind` bir ANAHTAR,
  `payload` dil-bağımsız küçük veri (referenceNo, postalCode). Puan geçmişinin "sebep cümlesi
  ekranda kurulur" kararının birebir aynısı; i18n istemcide, üç dil.

  ── `Record` DEĞİL, `Partial` + genel cümle — ve bu bilinçli bir SAPMA ─────────────────────────
  Puan geçmişi `Record` ile tam kapsam istiyor (küme kapalı: defter sebepleri). Burada küme AÇIK:
  `kind` DB'de düz text ve her modülle büyüyecek (0049 kararı) — sunucu yarın yeni bir tür yazar
  ve ESKİ uygulama sürümü onu tanımaz. `Record` olsaydı derleme bugünü kilitler ama sahadaki eski
  sürümü kurtaramazdı; bilinmeyen türe GENEL cümleyle düşmek sözleşmenin kendisi (defter girdisi:
  "ekran bilinmeyen türe genel cümleyle düşmeli").
*/

interface NotificationCopy {
  /** Satırın cümlesi — payload'dan kurulur; kişisel içerik payload'a hiç girmiyor (0049). */
  sentence: (payload: Record<string, unknown>, locale: Locale) => string;
}

const say = (locale: Locale, phrases: Record<Locale, string>): string => phrases[locale];

/** Referans payload'da olmayabilir (eski satır, farklı üretici) — cümle çizgisiz de kurulur. */
const refOf = (payload: Record<string, unknown>): string =>
  typeof payload.referenceNo === 'string' && payload.referenceNo !== '—' ? ` ${payload.referenceNo}` : '';

const COPY: Partial<Record<AppNotificationKind, NotificationCopy>> = {
  order_confirmed: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} alındı.`,
        fr: `Votre commande${refOf(p)} a bien été reçue.`,
        de: `Ihre Bestellung${refOf(p)} ist eingegangen.`,
      }),
  },
  order_out_for_delivery: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} yola çıktı.`,
        fr: `Votre commande${refOf(p)} est en route.`,
        de: `Ihre Bestellung${refOf(p)} ist unterwegs.`,
      }),
  },
  order_delivered: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} teslim edildi. Afiyet olsun!`,
        fr: `Votre commande${refOf(p)} a été livrée. Bon appétit !`,
        de: `Ihre Bestellung${refOf(p)} wurde zugestellt. Guten Appetit!`,
      }),
  },
  order_cancelled: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} iptal edildi.`,
        fr: `Votre commande${refOf(p)} a été annulée.`,
        de: `Ihre Bestellung${refOf(p)} wurde storniert.`,
      }),
  },
  order_shortfall: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişinizde${refOf(p)} bir kalem eksik karşılandı — ayrıntı sipariş sayfasında.`,
        fr: `Un article de votre commande${refOf(p)} a été livré en quantité incomplète.`,
        de: `Ein Artikel Ihrer Bestellung${refOf(p)} wurde unvollständig geliefert.`,
      }),
  },
  order_refunded: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} için iade işlendi.`,
        fr: `Un remboursement a été traité pour votre commande${refOf(p)}.`,
        de: `Für Ihre Bestellung${refOf(p)} wurde eine Rückerstattung veranlasst.`,
      }),
  },
  ticket_replied: {
    sentence: (_p, l) =>
      say(l, {
        tr: 'Talebinize cevap geldi.',
        fr: 'Vous avez reçu une réponse à votre demande.',
        de: 'Sie haben eine Antwort auf Ihre Anfrage erhalten.',
      }),
  },
  ticket_status_changed: {
    sentence: (_p, l) =>
      say(l, {
        tr: 'Talebinizin durumu güncellendi.',
        fr: 'Le statut de votre demande a été mis à jour.',
        de: 'Der Status Ihrer Anfrage wurde aktualisiert.',
      }),
  },
  feedback_invite: {
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişinizi${typeof p.orderReferenceNo === 'string' && p.orderReferenceNo !== '—' ? ` (${p.orderReferenceNo})` : ''} değerlendirir misiniz?`,
        fr: `Que pensez-vous de votre commande${typeof p.orderReferenceNo === 'string' && p.orderReferenceNo !== '—' ? ` (${p.orderReferenceNo})` : ''} ?`,
        de: `Wie fanden Sie Ihre Bestellung${typeof p.orderReferenceNo === 'string' && p.orderReferenceNo !== '—' ? ` (${p.orderReferenceNo})` : ''}?`,
      }),
  },
  zone_available: {
    sentence: (p, l) =>
      say(l, {
        tr: `Beklediğiniz bölge (${typeof p.postalCode === 'string' ? p.postalCode : '…'}) artık teslimat ağımızda!`,
        fr: `Votre zone (${typeof p.postalCode === 'string' ? p.postalCode : '…'}) est désormais desservie !`,
        de: `Ihr Gebiet (${typeof p.postalCode === 'string' ? p.postalCode : '…'}) wird jetzt beliefert!`,
      }),
  },
  b2b_application_result: {
    sentence: (p, l) =>
      p.approved === true
        ? say(l, {
            tr: 'Kurumsal başvurunuz onaylandı — toptan fiyatlar açıldı.',
            fr: 'Votre demande professionnelle a été approuvée — les tarifs pro sont actifs.',
            de: 'Ihr Geschäftsantrag wurde genehmigt — Großhandelspreise sind aktiv.',
          })
        : say(l, {
            tr: 'Kurumsal başvurunuz sonuçlandı — ayrıntı hesabınızda.',
            fr: 'Votre demande professionnelle a été traitée — détails dans votre compte.',
            de: 'Ihr Geschäftsantrag wurde bearbeitet — Details in Ihrem Konto.',
          }),
  },
};

/** Bilinmeyen türün cümlesi — eski uygulama sürümü yeni türü boş satırla değil, bununla karşılar. */
const FALLBACK: Record<Locale, string> = {
  tr: 'Hesabınızla ilgili bir gelişme var.',
  fr: 'Du nouveau concernant votre compte.',
  de: 'Es gibt Neuigkeiten zu Ihrem Konto.',
};

export function notificationSentence(row: Pick<NotificationRow, 'kind' | 'payload'>, locale: Locale): string {
  const copy = COPY[row.kind as AppNotificationKind];
  return copy ? copy.sentence(row.payload, locale) : FALLBACK[locale];
}

/**
 * Dokununca NEREYE — hedef adresten, İÇERİKTEN DEĞİL: sipariş rotası REFERANS ister (rota
 * künyesi) ve referans payload'da; talep rotası kimlik ister ve o `targetId`da. Gidilecek yeri
 * olmayan satır (davet: jetonu payload'da yok — bilinçli, jeton kimlik yerine geçer) `null` döner
 * ve dokunuş yalnız okundu işaretler.
 */
export function notificationHref(row: Pick<NotificationRow, 'kind' | 'targetType' | 'targetId' | 'payload'>): string | null {
  if (row.targetType === 'order' && typeof row.payload.referenceNo === 'string' && row.payload.referenceNo !== '—') {
    return `/order/${row.payload.referenceNo}`;
  }
  if (row.targetType === 'ticket' && row.targetId) return `/support/${row.targetId}`;
  if (row.kind === 'zone_available') return '/catalog';
  if (row.kind === 'b2b_application_result') return '/account';
  return null;
}
