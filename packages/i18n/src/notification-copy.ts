import type { AppNotificationKind } from '@lezzet/types';
import type { Locale } from './locale';

/*
  BİLDİRİM SÖZLÜĞÜ — kind + payload → cümle; İKİ YÜZEYİN ortak malı (14.15).

  Sözlük `apps/mobile`ın bildirim ekranında doğdu (14.13); web hesap akışı (14.15) aynı müşteriye
  aynı satırı gösterince BURAYA terfi etti: 11 tür × 3 dilin iki kopyası, ilk düzeltmede sessizce
  ayrışır ve aynı bildirim telefonda başka, web'de başka konuşurdu (CLAUDE §1). Paket seçimi de
  bu yüzden `@lezzet/i18n`: PATHNAMES ile aynı gerekçe — birden çok yüzeyin okuduğu dil verisi
  tek kaynakta durur. `@lezzet/types` bağı yalnız TİPTİR (derlemede silinir); paket çalışma
  zamanında bağımsız kalır.

  ── METİN SATIRDA DEĞİL, BURADA (14.12 kararı) ──────────────────────────────
  Satır cümle taşımaz: `kind` bir ANAHTAR, `payload` dil-bağımsız küçük veri (referenceNo,
  postalCode). Cümleyi okuyan yüzey kurar — dil müşterinin tercihi ve değişebilir.

  ── `Record` DEĞİL, `Partial` + genel cümle — bilinçli SAPMA ────────────────
  Küme AÇIK: `kind` DB'de düz text ve her modülle büyüyecek (0049) — sunucu yarın yeni bir tür
  yazar ve SAHADAKİ ESKİ mobil sürüm onu tanımaz. `Record` derlemeyi bugüne kilitler ama eski
  sürümü kurtaramazdı; bilinmeyen türe GENEL cümleyle düşmek sözleşmenin kendisi.
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

/** Müşteri satırının cümlesi — mobil bildirim ekranı ve web hesap akışı aynı fonksiyonu çağırır. */
export function notificationSentence(row: { kind: string; payload: Record<string, unknown> }, locale: Locale): string {
  const copy = COPY[row.kind as AppNotificationKind];
  return copy ? copy.sentence(row.payload, locale) : FALLBACK[locale];
}

/*
  ── PERSONEL SATIRI — AYRI SESLENİŞ, AYNI TERFİ GEREKÇESİ ───────────────────
  Müşteri sözlüğü "siparişiniz" der, personel sözlüğü "e-postasız müşterinin onayı" — iki ayrı
  sesleniş, tek dil (operasyon yüzeyi yalnız Türkçe, CLAUDE §2). Başlık metni de iki yüzeyde
  (native operasyon akışı + web operasyon zili) aynı satır için aynı olmak zorunda; yüzeye özgü
  olan yalnız GİDİLECEK YER (mobil bölüm ↔ web rotası) ve o eşleme yüzeyde kalır.
*/

/** Personel satırının aciliyet tonu — tasarım tonu değil ANLAM: alert = bekleyen insan işi. */
export type StaffNotificationTone = 'alert' | 'quiet';

export interface StaffNotificationBrief {
  title: string;
  tone: StaffNotificationTone;
}

const STAFF_COPY: Partial<Record<AppNotificationKind, (payload: Record<string, unknown>) => StaffNotificationBrief>> = {
  document_undeliverable: (p) => ({
    // `alert`: yasal belge (dayanıklı ortam) hiçbir kanala ulaşamadı ve iş İNSANA düştü.
    tone: 'alert',
    title: `Ulaştırılamayan sipariş onayı${typeof p.referenceNo === 'string' && p.referenceNo !== '—' ? ` — ${p.referenceNo}` : ''} — müşterinin e-postası yok`,
  }),
};

/**
 * Personel satırının başlığı + tonu; bilinmeyen türde `null` — genel satırın METNİ yüzeyindir
 * (mobil "uygulamayı güncelleyin" der, web diyemez: web her zaman sunucuyla aynı sürümdür).
 */
export function staffNotificationBrief(row: { kind: string; payload: Record<string, unknown> }): StaffNotificationBrief | null {
  const build = STAFF_COPY[row.kind as AppNotificationKind];
  return build ? build(row.payload) : null;
}
