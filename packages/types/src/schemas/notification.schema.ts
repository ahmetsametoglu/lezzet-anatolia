import { z } from 'zod';
import { PreferredLanguageEnum, TicketStatusEnum, TicketTypeEnum } from './enums.schema';

// Bildirim (modül 14) — müşteriye giden mesajın VERİ ŞEKLİ. DOMAIN §6, build/14.
//
// Neden burada: aynı şekli üç yer okur — şablon (`packages/email`), sürücü katmanı
// (`packages/notify`) ve veriyi kuran uygulama kapısı (`apps/web/lib/order/notify.ts`). Şablonun
// içine gömülseydi sürücü onu bilmezdi; kapıya konsaydı şablon uygulamaya bağlanırdı.
//
// **Bu bir görünüm modelidir, tablo değil.** Hiçbir yerde saklanmaz: gönderim anında siparişten,
// kalemlerinden ve ödeme türetiminden kurulur. Sipariş sonradan değişse bile giden mail değişmez —
// zaten gitmiştir; e-posta bir kopyadır, canlı ekran değil.

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
  /** Kargoda kurye penceresi yerine takip: numara + bağlantı (DOMAIN §6). */
  tracking: z.object({ number: z.string(), url: z.string() }).nullable(),

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
 * Talep bildiriminin verisi (14.7 · 16.4) — DOMAIN §15.
 *
 * **Enum'lar ham geçer, etiket değil.** Sipariş bildiriminde tutarlar biçimlenmiş gelir çünkü para
 * biçimi bir uygulama kararıdır; ama "çözüldü" kelimesi bir ÇEVİRİDİR ve çevirinin yeri şablonun
 * yanındaki metin tablosudur (`ticket-copy.ts`). Kapı etiket üretseydi aynı sözlük iki dilde iki
 * yerde dururdu.
 *
 * **`replyBody` tam metindir, özet değil:** personelin cevabı müşteriye aynen görünür (DOMAIN §15,
 * iç not yoktur). Kırpma bir sunum kararıdır ve şablona aittir.
 */
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

  /** `ticket_replied` olayında dolu: personelin son cevabı ve zamanı. */
  replyBody: z.string().nullable(),
  repliedAt: z.string().nullable(),
  /**
   * `ticket_status_changed` olayında dolu — nereden gelindiği. Yalnız yeni durumu göstermek
   * "çözüldü" ile "yeniden açıldı"yı ayırt edilemez kılardı.
   */
  previousStatus: TicketStatusEnum.nullable(),

  ticketUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type TicketNotification = z.infer<typeof TicketNotificationSchema>;
