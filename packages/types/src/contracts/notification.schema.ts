import { z } from 'zod';
import { PreferredLanguageEnum, TicketSenderEnum, TicketStatusEnum, TicketTypeEnum } from '../primitives/enums.schema';

// Müşteriye giden bildirimin veri şekli; şablon, sürücü ve veriyi kuran kapı aynı şekli okur. Görünüm modelidir, saklanmaz:
// gönderim anında kurulur ve sonradan değişen sipariş gitmiş e-postayı değiştirmez.

/** Zaman çizgisi adımının hâli — tasarımda üç görünüm: dolu, o an, soluk. */
export const NotificationStepStateEnum = z.enum(['done', 'current', 'pending']);
export type NotificationStepState = z.infer<typeof NotificationStepStateEnum>;

export const NotificationStepSchema = z.object({
  key: z.enum(['received', 'prepared', 'on_the_way', 'delivered']),
  state: NotificationStepStateEnum,
  /** Adımın altındaki küçük metin: gerçekleşmişse zamanı, gerçekleşmemişse beklenen zaman. */
  detail: z.string().nullable(),
});
export type NotificationStep = z.infer<typeof NotificationStepSchema>;

export const NotificationLineSchema = z.object({
  name: z.string(),
  /** Ağırlık/adet + birim fiyat gibi ikincil satır ("700 g · 2 × 16,90 €"). */
  meta: z.string().nullable(),
  qty: z.number().int(),
  /** Kalem tutarı, biçimlenmiş ("33,80 €"). Biçimleme kapıda yapılır: şablon para bilmez. */
  amount: z.string().nullable(),
  /**
   * Eksik karşılanma notu — YALNIZ fark olan kalemde dolu. Tasarım kuralı: **sebep yazılmaz**,
   * yalnız miktar + para çözümü ("5 sipariş edildi, 4 gönderildi — 5,90 € iade edilecek").
   */
  shortfall: z.string().nullable(),
});
export type NotificationLine = z.infer<typeof NotificationLineSchema>;

export const NotificationTotalSchema = z.object({
  label: z.string(),
  value: z.string(),
  /** Lehte satır (indirim, ücretsiz teslimat) — tasarımda yeşil gösterilir. */
  positive: z.boolean().optional(),
});
export type NotificationTotal = z.infer<typeof NotificationTotalSchema>;

/**
 * Sipariş bildiriminin tam verisi. Alanların çoğu opsiyoneldir çünkü üç şablon aynı şekli farklı
 * doldurur: onayda teslimat penceresi vardır takip yoktur, yoldaki kargoda takip vardır pencere
 * yoktur, teslimde özet vardır kalem listesi yoktur.
 */
export const OrderNotificationSchema = z.object({
  referenceNo: z.string(),
  /** Siparişin verildiği gün, biçimlenmiş ("22 Temmuz 2026"). */
  orderedOn: z.string(),
  customerName: z.string().nullable(),
  locale: PreferredLanguageEnum,

  steps: z.array(NotificationStepSchema),
  lines: z.array(NotificationLineSchema),
  totals: z.array(NotificationTotalSchema),
  /** Genel toplam — tasarımda kalın ve ayrı çizgi üstünde. */
  grandTotal: z.object({ label: z.string(), value: z.string() }).nullable(),
  /** Ödeme hapı ("Online ödendi" / "Kapıda ödenecek"). */
  paymentNote: z.string().nullable(),

  /** Teslimat kutusu: ikon satırı + adres/açıklama. */
  delivery: z
    .object({ headline: z.string(), detail: z.string(), icon: z.string() })
    .nullable(),
  /**
   * Kargoda kurye penceresi yerine takip; dizi, çünkü çok kolili gönderide her kolinin ayrı numarası var. `null` takip edilecek bir
   * şey yok demektir; numarası henüz yazılmamış gönderi e-postaya konu olmaz.
   */
  tracking: z
    .array(
      z.object({
        /** Kutu sırası (`"2/3"`) — tek kutuluda `null`. Dilden bağımsız: rakam çifti her dilde aynı. */
        ordinal: z.string().nullable(),
        number: z.string(),
        /** Taşıyıcının takip sayfası; bazı taşıyıcıda yok. */
        url: z.string().nullable(),
      }),
    )
    .nullable(),

  /**
   * İSTİSNA bildirimlerinde (iptal / iade / eksik karşılanma) olayın anı, biçimlenmiş
   * ("22 Temmuz, 10:40"). Bu üç mailde zaman çizgisi YOKTUR — tasarımın kuralı: akış bildirimi
   * yolculuğu gösterir, istisna bildirimi tek anı gösterir.
   */
  statusAt: z.string().nullable(),
  /**
   * Paranın çözümü — istisna bildirimlerinin İLK kartı (tasarım: "para çözümü her zaman ilk kartta").
   * `currentTotal` iptalde null'dır: sipariş kalmadı, güncellenecek toplam da yok.
   */
  refund: z
    .object({ amount: z.string(), previousTotal: z.string(), currentTotal: z.string().nullable() })
    .nullable(),
  /**
   * Peşin ödendi mi — dipnotun yönünü belirler: ödendiyse "fark karta iade edilir", ödenmediyse
   * "tahsilat güncel tutardan yapılır" (tasarım: kapıda ödemede iade satırı yerine bu cümle).
   */
  paidOnline: z.boolean(),

  orderUrl: z.string(),
  /** Teslimat özeti belgesi — yalnız teslim mailinde; "resmî fatura değildir" ibaresiyle. */
  deliverySummaryUrl: z.string().nullable(),
  supportUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type OrderNotification = z.infer<typeof OrderNotificationSchema>;

/**
 * Talep bildiriminin verisi. Enum'lar ham geçer, çünkü etiket bir çeviridir ve çeviri şablonun yanındaki metin tablosunda durur;
 * e-posta son mesajları da taşır ki müşteri bağlamı görmek için tıklamasın.
 */

/** Alıntılanan tek mesaj. Gövde kapıda kırpılır, çünkü talebin mesajları sınırsız büyür ve kırpılmamış yazışma e-postayı şişirirdi. */
export const TicketHistoryEntrySchema = z.object({
  /** Kim yazdı — şablon "Siz" ile markayı ayırt eder. `ai` müşteriye ayrı gösterilmez (DOMAIN §15). */
  sender: TicketSenderEnum,
  body: z.string(),
  /** Biçimlenmiş zaman ("24 Temmuz, 10:40"). */
  at: z.string(),
  /** Kırpıldıysa şablon "…" ve tam metnin bağlantısını gösterir — sessiz kırpma yalan söylerdi. */
  truncated: z.boolean(),
  /**
   * Müşterinin henüz görmediği mesaj mı; tek e-posta birden çok yeni cevap taşıyabildiği için haberi bağlamdan bu alan ayırır.
   * Ölçüt yöndür: müşterinin son mesajından sonra gelen kesintisiz karşı taraf dizisi.
   */
  unread: z.boolean(),
});
export type TicketHistoryEntry = z.infer<typeof TicketHistoryEntrySchema>;

export const TicketNotificationSchema = z.object({
  ticketId: z.string().uuid(),
  /** Yüzeyin türettiği ya da personelin koyduğu başlık; yoksa şablon tipten bir başlık kurar. */
  subject: z.string().nullable(),
  type: TicketTypeEnum,
  status: TicketStatusEnum,
  customerName: z.string().nullable(),
  locale: PreferredLanguageEnum,
  /** Talep bir siparişe bağlıysa referansı — müşterinin "hangi sipariş" sorusunun cevabı. */
  orderReferenceNo: z.string().nullable(),
  /** Talebin açıldığı gün, biçimlenmiş ("22 Temmuz 2026"). */
  openedOn: z.string(),

  /**
   * Yazışmanın son mesajları, en yeniden eskiye; `history[0]` e-postanın konusu olan mesajdır ve tam kartta çizilir. Durum
   * değişikliği şablonu bunu kullanmaz ama alan yine dolu gelir, çünkü hangi bloğun çizileceği şablonun kararıdır.
   */
  history: z.array(TicketHistoryEntrySchema),
  /**
   * `ticket_status_changed` olayında dolu — nereden gelindiği. Yalnız yeni durumu göstermek
   * "çözüldü" ile "yeniden açıldı"yı ayırt edilemez kılardı.
   */
  previousStatus: TicketStatusEnum.nullable(),

  ticketUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type TicketNotification = z.infer<typeof TicketNotificationSchema>;

/**
 * Alım sonrası değerlendirme davetinin verisi; tek bir şey istediği için sipariş bildiriminin şeklini kullanmaz. Puan miktarı
 * taşınmaz, çünkü verilip verilmeyeceği tamamlama anındaki tavana ve müşteri türüne bağlıdır.
 */
export const FeedbackInviteNotificationSchema = z.object({
  customerName: z.string().nullable(),
  locale: PreferredLanguageEnum,
  /** Hangi sipariş — müşterinin "ne değerlendireceğim" sorusunun cevabı. */
  orderReferenceNo: z.string(),
  /** Teslim günü, biçimlenmiş ("22 Temmuz 2026"). Davet teslimden ~10 gün sonra gider. */
  deliveredOn: z.string(),
  /**
   * Değerlendirilecek ÜRÜN sayısı (kalem değil — aynı ürünün iki boyu tek karttır, akışla aynı
   * sayım). Metinde "kaç dakika sürer" beklentisini bu kuruyor; kartların sayısıyla uyuşmazsa
   * müşteri sözden fazlasıyla karşılaşır.
   */
  productCount: z.number().int(),

  /** Davetin kendisi — `/feedback/[token]`; token oturum yerine geçer. */
  feedbackUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type FeedbackInviteNotification = z.infer<typeof FeedbackInviteNotificationSchema>;

/**
 * Beklenen bölge açıldı: müşterinin "gelince haber verin" kaydının karşılığı. Kimlik taşımaz, çünkü kayıt ziyaretçiden de alınır ve
 * elde çoğu zaman yalnız e-posta ile posta kodu vardır; `customerName` bu yüzden çoğu zaman boştur.
 */
export const ZoneAvailableNotificationSchema = z.object({
  customerName: z.string().nullable(),
  locale: PreferredLanguageEnum,
  /** Hangi kod açıldı — müşterinin kaydettiği kodun aynısı. */
  postalCode: z.string(),
  /** Alışverişe başlanacak yer; tek eylem, tek buton. */
  catalogUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type ZoneAvailableNotification = z.infer<typeof ZoneAvailableNotificationSchema>;

/** Kurumsal başvurunun sonucu, onay ya da ret. Tek olaydır, çünkü alıcı, kanal ve tetikleyen karar aynıdır; ayrım `approved`ta. */
export const B2bApplicationResultNotificationSchema = z.object({
  customerName: z.string().nullable(),
  locale: PreferredLanguageEnum,
  companyName: z.string().nullable(),
  approved: z.boolean(),
  /**
   * Ret gerekçesi, müşterinin dilinde çözülmüş hâliyle; onayda `null`. Operatör Türkçe yazar, ham metin geçseydi Fransız müşteri
   * Türkçe cümle okurdu.
   */
  reason: z.string().nullable(),
  /** Onayda toptan vitrine, rette hesaba — çağıran çözer, şablon yalnız çizer. */
  actionUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type B2bApplicationResultNotification = z.infer<typeof B2bApplicationResultNotificationSchema>;
