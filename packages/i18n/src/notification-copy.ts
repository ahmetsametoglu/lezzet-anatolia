import type { AppNotificationKind } from '@lezzet/types';
import type { Locale } from './locale';

/*
  Müşteri bildiriminin başlığı ve cümlesi — iki yüzeyin (native bildirim ekranı, web hesap akışı) ortak kaynağı. Satır
  metin taşımaz: `kind` anahtardır, metin `payload`tan (dil-bağımsız küçük veri) okuyan yüzeyin dilinde kurulur.
*/

interface NotificationCopy {
  /** Kartın kısa başlığı — ne oldu. */
  title: (payload: Record<string, unknown>, locale: Locale) => string;
  /** Kartın cümlesi — payload'dan kurulur; kişisel içerik payload'a hiç girmez. */
  sentence: (payload: Record<string, unknown>, locale: Locale) => string;
}

const say = (locale: Locale, phrases: Record<Locale, string>): string => phrases[locale];

/** Referans payload'da olmayabilir (eski satır, farklı üretici) — cümle referanssız da kurulur. */
const refOf = (payload: Record<string, unknown>): string =>
  typeof payload.referenceNo === 'string' && payload.referenceNo !== '—' ? ` ${payload.referenceNo}` : '';

/* Küme açık (`kind` DB'de düz metin, her modülle büyür): `Record` değil `Partial` — bilinmeyen tür genel metne düşer. */
const COPY: Partial<Record<AppNotificationKind, NotificationCopy>> = {
  order_confirmed: {
    title: (_p, l) => say(l, { tr: 'Siparişiniz alındı', fr: 'Commande reçue', de: 'Bestellung eingegangen' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} alındı.`,
        fr: `Votre commande${refOf(p)} a bien été reçue.`,
        de: `Ihre Bestellung${refOf(p)} ist eingegangen.`,
      }),
  },
  order_out_for_delivery: {
    title: (_p, l) => say(l, { tr: 'Siparişiniz yolda', fr: 'Commande en route', de: 'Bestellung unterwegs' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} yola çıktı.`,
        fr: `Votre commande${refOf(p)} est en route.`,
        de: `Ihre Bestellung${refOf(p)} ist unterwegs.`,
      }),
  },
  order_delivered: {
    title: (_p, l) => say(l, { tr: 'Siparişiniz teslim edildi', fr: 'Commande livrée', de: 'Bestellung zugestellt' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} teslim edildi. Afiyet olsun!`,
        fr: `Votre commande${refOf(p)} a été livrée. Bon appétit !`,
        de: `Ihre Bestellung${refOf(p)} wurde zugestellt. Guten Appetit!`,
      }),
  },
  order_cancelled: {
    title: (_p, l) => say(l, { tr: 'Siparişiniz iptal edildi', fr: 'Commande annulée', de: 'Bestellung storniert' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} iptal edildi.`,
        fr: `Votre commande${refOf(p)} a été annulée.`,
        de: `Ihre Bestellung${refOf(p)} wurde storniert.`,
      }),
  },
  order_shortfall: {
    title: (_p, l) => say(l, { tr: 'Eksik teslimat', fr: 'Livraison incomplète', de: 'Unvollständige Lieferung' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişinizde${refOf(p)} bir kalem eksik karşılandı — ayrıntı sipariş sayfasında.`,
        fr: `Un article de votre commande${refOf(p)} a été livré en quantité incomplète.`,
        de: `Ein Artikel Ihrer Bestellung${refOf(p)} wurde unvollständig geliefert.`,
      }),
  },
  order_refunded: {
    title: (_p, l) => say(l, { tr: 'İade işlendi', fr: 'Remboursement effectué', de: 'Erstattung veranlasst' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişiniz${refOf(p)} için iade işlendi.`,
        fr: `Un remboursement a été traité pour votre commande${refOf(p)}.`,
        de: `Für Ihre Bestellung${refOf(p)} wurde eine Rückerstattung veranlasst.`,
      }),
  },
  ticket_replied: {
    title: (_p, l) => say(l, { tr: 'Talebinize cevap var', fr: 'Réponse à votre demande', de: 'Antwort auf Ihre Anfrage' }),
    sentence: (_p, l) =>
      say(l, {
        tr: 'Talebinize cevap geldi.',
        fr: 'Vous avez reçu une réponse à votre demande.',
        de: 'Sie haben eine Antwort auf Ihre Anfrage erhalten.',
      }),
  },
  ticket_status_changed: {
    title: (_p, l) => say(l, { tr: 'Talebiniz güncellendi', fr: 'Demande mise à jour', de: 'Anfrage aktualisiert' }),
    sentence: (_p, l) =>
      say(l, {
        tr: 'Talebinizin durumu güncellendi.',
        fr: 'Le statut de votre demande a été mis à jour.',
        de: 'Der Status Ihrer Anfrage wurde aktualisiert.',
      }),
  },
  feedback_invite: {
    title: (_p, l) => say(l, { tr: 'Siparişinizi değerlendirin', fr: 'Votre avis compte', de: 'Ihre Meinung zählt' }),
    // Referans `referenceNo`dan okunur: hedef siparişe çevrildiğinden beri öteki sipariş türleriyle aynı ad.
    sentence: (p, l) =>
      say(l, {
        tr: `Siparişinizi${referans(p) ? ` (${p.referenceNo})` : ''} değerlendirir misiniz?`,
        fr: `Que pensez-vous de votre commande${referans(p) ? ` (${p.referenceNo})` : ''} ?`,
        de: `Wie fanden Sie Ihre Bestellung${referans(p) ? ` (${p.referenceNo})` : ''}?`,
      }),
  },
  zone_available: {
    title: (_p, l) => say(l, { tr: 'Bölgeniz açıldı', fr: 'Votre zone est desservie', de: 'Ihr Gebiet wird beliefert' }),
    sentence: (p, l) =>
      say(l, {
        tr: `Beklediğiniz bölge (${typeof p.postalCode === 'string' ? p.postalCode : '…'}) artık teslimat ağımızda!`,
        fr: `Votre zone (${typeof p.postalCode === 'string' ? p.postalCode : '…'}) est désormais desservie !`,
        de: `Ihr Gebiet (${typeof p.postalCode === 'string' ? p.postalCode : '…'}) wird jetzt beliefert!`,
      }),
  },
  b2b_application_result: {
    title: (p, l) =>
      p.approved === true
        ? say(l, { tr: 'Kurumsal başvurunuz onaylandı', fr: 'Demande pro approuvée', de: 'Geschäftsantrag genehmigt' })
        : say(l, { tr: 'Kurumsal başvurunuz sonuçlandı', fr: 'Demande pro traitée', de: 'Geschäftsantrag bearbeitet' }),
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

/** Bilinmeyen türün metni — eski uygulama sürümü yeni türü boş satırla değil, bununla karşılar. */
const FALLBACK_TITLE: Record<Locale, string> = {
  tr: 'Yeni bildirim',
  fr: 'Nouvelle notification',
  de: 'Neue Mitteilung',
};

const FALLBACK: Record<Locale, string> = {
  tr: 'Hesabınızla ilgili bir gelişme var.',
  fr: 'Du nouveau concernant votre compte.',
  de: 'Es gibt Neuigkeiten zu Ihrem Konto.',
};

/** Müşteri kartının başlığı — native bildirim ekranı ve web hesap akışı aynı fonksiyonu çağırır. */
export function notificationTitle(row: { kind: string; payload: Record<string, unknown> }, locale: Locale): string {
  const copy = COPY[row.kind as AppNotificationKind];
  return copy ? copy.title(row.payload, locale) : FALLBACK_TITLE[locale];
}

/** Müşteri kartının cümlesi — native bildirim ekranı ve web hesap akışı aynı fonksiyonu çağırır. */
export function notificationSentence(row: { kind: string; payload: Record<string, unknown> }, locale: Locale): string {
  const copy = COPY[row.kind as AppNotificationKind];
  return copy ? copy.sentence(row.payload, locale) : FALLBACK[locale];
}

/*
  Türün görsel kimliği: ikon, semantik ton ve kısa tür etiketi — müşteri bir bakışta türü ayırt eder. İkon iki biçimde
  (`symbol` web çizgi setinin adı, `icon` native'in emojisi); ton renk değil anlamdır, yüzey kendi paletine çevirir.
*/

export type NotificationVisualTone = 'positive' | 'attention' | 'issue' | 'neutral';

/** Web çizgi setinin (`IconName`) adları — sette olmayan ad yazılırsa web derlenmez. */
export type NotificationSymbol = 'check' | 'truck' | 'box' | 'close' | 'warning' | 'undo' | 'chat' | 'star' | 'pin' | 'building' | 'bell';

export interface NotificationVisual {
  /** Emoji — native uygulamanın çizimi. */
  icon: string;
  /** Çizgi ikonun adı — web müşteri yüzeyi bununla çizer. */
  symbol: NotificationSymbol;
  tone: NotificationVisualTone;
  label: (locale: Locale) => string;
}

const etiket = (phrases: Record<Locale, string>) => (locale: Locale) => phrases[locale];

const VISUAL: Partial<Record<AppNotificationKind, (payload: Record<string, unknown>) => NotificationVisual>> = {
  order_confirmed: () => ({ symbol: 'check', icon: '✅', tone: 'positive', label: etiket({ tr: 'Sipariş', fr: 'Commande', de: 'Bestellung' }) }),
  order_out_for_delivery: () => ({ symbol: 'truck', icon: '🚚', tone: 'positive', label: etiket({ tr: 'Teslimat', fr: 'Livraison', de: 'Lieferung' }) }),
  order_delivered: () => ({ symbol: 'box', icon: '📦', tone: 'positive', label: etiket({ tr: 'Teslimat', fr: 'Livraison', de: 'Lieferung' }) }),
  order_cancelled: () => ({ symbol: 'close', icon: '✖️', tone: 'issue', label: etiket({ tr: 'Sipariş', fr: 'Commande', de: 'Bestellung' }) }),
  order_shortfall: () => ({ symbol: 'warning', icon: '⚠️', tone: 'attention', label: etiket({ tr: 'Sipariş', fr: 'Commande', de: 'Bestellung' }) }),
  order_refunded: () => ({ symbol: 'undo', icon: '💶', tone: 'attention', label: etiket({ tr: 'İade', fr: 'Remboursement', de: 'Erstattung' }) }),
  ticket_replied: () => ({ symbol: 'chat', icon: '💬', tone: 'neutral', label: etiket({ tr: 'Talep', fr: 'Demande', de: 'Anfrage' }) }),
  ticket_status_changed: () => ({ symbol: 'chat', icon: '💬', tone: 'neutral', label: etiket({ tr: 'Talep', fr: 'Demande', de: 'Anfrage' }) }),
  feedback_invite: () => ({ symbol: 'star', icon: '⭐', tone: 'attention', label: etiket({ tr: 'Değerlendirme', fr: 'Avis', de: 'Bewertung' }) }),
  zone_available: () => ({ symbol: 'pin', icon: '📍', tone: 'positive', label: etiket({ tr: 'Bölge', fr: 'Zone', de: 'Gebiet' }) }),
  b2b_application_result: (p) => ({
    symbol: 'building',
    icon: '🏢',
    // Onay "yolunda", öteki sonuç "bak" — metnin aynı ayrımı.
    tone: p.approved === true ? 'positive' : 'attention',
    label: etiket({ tr: 'Kurumsal', fr: 'Professionnel', de: 'Geschäftlich' }),
  }),
};

/** Bilinmeyen tür görselsiz kalmaz: zil ikonu ve nötr ton. */
const VISUAL_FALLBACK: NotificationVisual = {
  symbol: 'bell',
  icon: '🔔',
  tone: 'neutral',
  label: etiket({ tr: 'Bildirim', fr: 'Notification', de: 'Mitteilung' }),
};

export function notificationVisual(row: { kind: string; payload: Record<string, unknown> }): NotificationVisual {
  const build = VISUAL[row.kind as AppNotificationKind];
  return build ? build(row.payload) : VISUAL_FALLBACK;
}

/*
  Personel satırı ayrı seslenişle (operasyon yalnız Türkçe) ama aynı kaynakta: başlık native operasyon akışında ve web
  operasyon zilinde aynı olmak zorunda; yüzeye özgü olan yalnız gidilecek yer.
*/

/** Personel satırının aciliyeti: `alert` bekleyen insan işi, `attention` bakılmalı, `quiet` bilgi. */
export type StaffNotificationTone = 'alert' | 'attention' | 'quiet';

export interface StaffNotificationBrief {
  title: string;
  /** Başlık "ne oldu + hangi kayıt", alt satır "ne kadar / neden"; söyleyecek olgu yoksa `null`, uydurulmaz. */
  subtitle: string | null;
  tone: StaffNotificationTone;
  /** Kısa tür etiketi ("Belge") — satırın şapkası. */
  label: string;
}

/** Talep tipinin kısa Türkçe hâli — başlıkta ham enum değeri geçirilmez. */
const TALEP_TIPI: Record<string, string> = { damaged: 'hasarlı ürün', missing: 'eksik ürün', question: 'soru', other: 'diğer' };

const referans = (p: Record<string, unknown>): string =>
  typeof p.referenceNo === 'string' && p.referenceNo !== '—' ? ` — ${p.referenceNo}` : '';

/** Hangi belge ulaşamadı (`payload.event`): altı olay aynı satır görünmesin, operatör elden göndereceğini okusun. */
const BELGE_ADI: Record<string, string> = {
  order_confirmed: 'sipariş onayı',
  order_delivered: 'teslim özeti',
  order_cancelled: 'iptal bildirimi',
  order_shortfall: 'eksik teslim bildirimi',
  order_refunded: 'iade bildirimi',
  b2b_application_result: 'kurumsal başvuru sonucu',
};
const belgeAdi = (p: Record<string, unknown>): string =>
  (typeof p.event === 'string' ? BELGE_ADI[p.event] : undefined) ?? 'belge';

const STAFF_COPY: Partial<Record<AppNotificationKind, (payload: Record<string, unknown>) => StaffNotificationBrief>> = {
  document_undeliverable: (p) => ({
    // `alert`: yasal belge hiçbir kanala ulaşamadı, iş insana düştü.
    tone: 'alert',
    label: 'Belge',
    title: `Ulaştırılamayan ${belgeAdi(p)}${referans(p)}`,
    subtitle: 'müşterinin e-postası yok',
  }),
  ticket_opened: (p) => ({
    tone: 'alert',
    label: p.ticketType === 'damaged' || p.ticketType === 'missing' ? 'Şikâyet' : 'Talep',
    title: `Yeni ${p.ticketType === 'damaged' || p.ticketType === 'missing' ? 'şikâyet' : 'talep'}${referans(p)}`,
    /* Talep tipi yazılmamışsa alt satır yok: "diğer" yazmak bilinmeyeni bir kategoriye çevirmek olurdu. */
    subtitle: typeof p.ticketType === 'string' ? (TALEP_TIPI[p.ticketType] ?? null) : null,
  }),
  stock_low: (p) => ({
    tone: 'attention',
    label: 'Stok',
    title: `Eşik altına indi — ${typeof p.sku === 'string' && p.sku ? p.sku : 'varyant'}`,
    subtitle: `kullanılabilir ${typeof p.availableQty === 'number' ? p.availableQty : '?'}/${typeof p.minStockQty === 'number' ? p.minStockQty : '?'}`,
  }),
  run_close_mismatch: (p) => ({
    tone: 'alert',
    label: 'Para',
    title: `Gün kapanışında uyuşmazlık${referans(p)}`,
    subtitle: 'sayım beklenenden farklı',
  }),
  /* Kapanış "yeniden planlanacak" dedi; planlayan sevkiyat masası. */
  run_close_pending: (p) => ({
    tone: 'attention',
    label: 'Sevkiyat',
    title: `Sefer kapandı${referans(p)}`,
    subtitle: `${typeof p.pendingCount === 'number' ? p.pendingCount : '?'} durak askıda · yeniden planla`,
  }),
  /* Alan depo eksiği beyan etti, kayıp onun hanesine yazıldı — gönderen depo duyar. */
  transfer_shortfall: (p) => ({
    tone: 'attention',
    label: 'Transfer',
    title: `Transfer eksik kabul edildi${referans(p)}`,
    subtitle: `${typeof p.shortQty === 'number' ? p.shortQty : '?'} adet eksik · ${typeof p.toWarehouseCode === 'string' ? p.toWarehouseCode : 'alan depo'} kayıp yazdı`,
  }),
  /* Alan depo fazlayı stoğuna yazdı — gönderen o birimi kendi sayımında bulsun. */
  transfer_excess: (p) => ({
    tone: 'attention',
    label: 'Transfer',
    title: `Transfer fazla kabul edildi${referans(p)}`,
    subtitle: `${typeof p.excessQty === 'number' ? p.excessQty : '?'} adet fazla · ${typeof p.toWarehouseCode === 'string' ? p.toWarehouseCode : 'alan depo'} stoğuna yazdı`,
  }),
  b2b_application_received: () => ({
    tone: 'attention',
    label: 'Kurumsal',
    title: 'Yeni kurumsal başvuru',
    subtitle: 'onay kuyruğunda',
  }),
};

/** Personel satırının başlığı ve tonu; bilinmeyen türde `null` — genel metin yüzeyin işi (mobil "güncelleyin" der, web diyemez). */
export function staffNotificationBrief(row: { kind: string; payload: Record<string, unknown> }): StaffNotificationBrief | null {
  const build = STAFF_COPY[row.kind as AppNotificationKind];
  return build ? build(row.payload) : null;
}
