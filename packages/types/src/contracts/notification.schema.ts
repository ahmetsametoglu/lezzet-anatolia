import { z } from 'zod';
import { PreferredLanguageEnum, TicketSenderEnum, TicketStatusEnum, TicketTypeEnum } from '../primitives/enums.schema';

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
 * **Mail yazışmanın KENDİSİNİ taşır** (16.4, referans desen): son mesajlar `history` içinde gelir,
 * müşteri bağlamı görmek için tıklamak zorunda kalmaz. Önce yalnız `replyBody` vardı — cevabın
 * öncesi görünmüyordu ve "neye cevap verdiler" sorusu için tıklamak gerekiyordu.
 */

/**
 * Alıntılanan tek mesaj. **Gövde kapıda kırpılır, şablonda değil:** bir talebin mesajları sınırsız
 * büyür (`CLAUDE.md §1`) ve şablona kırpılmamış bir yazışma vermek, payload'ı ve maili sınırsız
 * şişirirdi. Sunum kararı değil, sözleşme sınırı.
 */
export const TicketHistoryEntrySchema = z.object({
  /** Kim yazdı — şablon "Siz" ile markayı ayırt eder. `ai` müşteriye ayrı gösterilmez (DOMAIN §15). */
  sender: TicketSenderEnum,
  body: z.string(),
  /** Biçimlenmiş zaman ("24 Temmuz, 10:40"). */
  at: z.string(),
  /** Kırpıldıysa şablon "…" ve tam metnin bağlantısını gösterir — sessiz kırpma yalan söylerdi. */
  truncated: z.boolean(),
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
   * Yazışmanın son mesajları, **en yeniden eskiye** — mailin okunma yönü budur (yeni haber üstte,
   * bağlam altında; e-posta alıntı geleneği).
   *
   * `history[0]` mailin KONUSU olan mesajdır: `ticket_replied`'da personelin cevabı,
   * `ticket_received`'da müşterinin kendi anlatımı. Şablon onu tam kartta gösterir, kalanını
   * alıntılar. Ayrı bir `replyBody` alanı vardı ve kaldırıldı: aynı mesajı iki alanda taşımak,
   * "hangisi güncel" sorusunu doğuran türden bir tekrardı.
   *
   * `ticket_status_changed` şablonu bunu KULLANMAZ (o mailin konusu bir mesaj değil bir durum);
   * alan yine dolu gelir çünkü kapı olay başına ayrı veri kurmaz — hangi bloğun çizileceği
   * şablonun kararıdır.
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
 * Alım-sonrası değerlendirme davetinin verisi (17.2) — DOMAIN §14.
 *
 * **Sipariş bildirimi DEĞİLDİR ve `OrderNotification`'ı yeniden kullanmaz.** O şekil siparişin
 * anlatısını taşır (zaman çizgisi, kalemler, tutarlar, ödeme); davetin işi tek bir şey istemek.
 * Aynı tipe bindirilseydi şablon otuz alandan üçünü doldurup gerisini `null` geçerdi ve derleyici
 * "bu mailde tutar niye yok" sorusunu hiç soramazdı.
 *
 * **Puan miktarı BURADA YOKTUR ve bu bilinçli.** Puan tamamlamada verilir, verilip verilmeyeceği o
 * anki günlük tavana ve müşteri türüne bağlıdır (B2B kazanmaz — DOMAIN §14). Davette bir sayı
 * yazmak, tutulamayabilecek bir söz vermektir; müşteri akışı bitirir, puanı görmez ve haklı olarak
 * kandırıldığını düşünür.
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
 * **BEKLENEN BÖLGE AÇILDI** (14.10 · 19.21).
 *
 * Müşteri bir posta kodu için "gelince haber verin" demişti (`zone_notice`) — kayıt bir SÖZ
 * değildi, bir nottu; bu mail o notun karşılığıdır.
 *
 * **Kimlik taşımıyor ve taşımamalı:** `zone_notice` ziyaretçiden de kayıt alıyor (`customerId`
 * null olabilir), yani elimizde çoğu zaman yalnız e-posta ve posta kodu var. Şablon bir sipariş
 * künyesi ya da hesap bilgisi isteseydi kayıtların yarısı gönderilemezdi.
 *
 * **`customerName` null olabilir ve normali budur** — ziyaretçi adını hiç vermedi.
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

/**
 * **B2B BAŞVURU SONUCU** (14.10) — onay ya da ret.
 *
 * **Boşluğun tarifi:** gerekçe veride ZORUNLU, 20.2 onu üç dile çeviriyor ve bugüne dek hiçbir
 * okuyucuya ulaşmıyordu; künye "müşteriye e-postayla gidiyor" diyordu ama öyle bir şablon hiç
 * yazılmamıştı (müşteri şeridinin ölçümü, 04.08).
 *
 * **Tek olay, iki sonuç** — ayrı olaylar değil: alıcı aynı, kanal aynı, tetikleyen aynı karar.
 * İki olay olsaydı sürücü listesine iki satır, şablon klasörüne iki dosya girer ve ikisi bir gün
 * ayrışırdı. Ayrım `approved` bayrağında.
 */
export const B2bApplicationResultNotificationSchema = z.object({
  customerName: z.string().nullable(),
  locale: PreferredLanguageEnum,
  companyName: z.string().nullable(),
  approved: z.boolean(),
  /**
   * Ret gerekçesi — **müşterinin dilinde çözülmüş hâli** (20.2 `resolveUserText`). Onayda `null`.
   *
   * Operatör gerekçeyi Türkçe yazıyor; çeviri işi onu müşterinin diline çeviriyor. Ham metni
   * geçirseydik Fransız müşteri Türkçe bir cümle okurdu — gerekçenin zorunlu olmasının sebebi de
   * tam olarak okunabilmesiydi.
   */
  reason: z.string().nullable(),
  /** Onayda toptan vitrine, rette hesaba — çağıran çözer, şablon yalnız çizer. */
  actionUrl: z.string(),
  notificationPreferencesUrl: z.string(),
});
export type B2bApplicationResultNotification = z.infer<typeof B2bApplicationResultNotificationSchema>;
