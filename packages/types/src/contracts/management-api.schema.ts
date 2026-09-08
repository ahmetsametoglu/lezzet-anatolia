import { z } from 'zod';
import {
  CountryEnum,
  OrderSourceEnum,
  OrderStatusEnum,
  TicketHandlerEnum,
  TicketSenderEnum,
  TicketSourceEnum,
  TicketStatusEnum,
  TicketTypeEnum,
} from '../primitives/enums.schema';
import { SourceLanguageSchema } from '../primitives/user-text.schema';

/**
 * `/api/v1/management/*` SÖZLEŞME şemaları (21.12) — yönetim bölümünün (Y1–Y6 · gün özeti)
 * uçlarıyla ekranlarının ortak dili. Terfi gerekçesi öteki `*-api.schema` dosyalarıyla aynı
 * (02-mimari §3.2 "sözleşme tek kaynak"): istemci şemayı buradan alır, yeniden yazmaz.
 *
 * ── ETİKET DEĞİL VERİ ────────────────────────────────────────────────────────
 * Eski fixture "12 dk", "2 gün" gibi CÜMLELER taşıyordu çünkü arkasında damga yoktu
 * (`management-fixture.ts` künyesi). Uç artık damgayı (`...At`) ve ham sayıyı taşır; cümleyi
 * yüzey kurar. Sunucudan cümle göndermek, dil ve biçim kararını tele gömmek olurdu.
 */

/* ── KURUMSAL BAŞVURUNUN ORTAK İLKELERİ ─────────────────────────────────────
   İki bölüm birden okuyor: karar kutusunun B2B kartı (aşağıda) ve başvuru bölümünün kendisi
   (dosyanın sonunda). Şema tanımları yukarıdan aşağı değerlendiği için ortak ilkeler EN ÜSTTE
   durmak zorunda; ikinci bir bayrak tanımlamak (CLAUDE §1 · duplication) seçenek değildi —
   kutunun bayrağı ile listenin bayrağı bir gün ayrışırdı. */

/** Sinyalin üç tonu — `domain-core.SignalTone`un tel karşılığı; renk değil ANLAM taşır. */
export const B2bSignalToneEnum = z.enum(['ok', 'warn', 'bad']);

/** Başvurunun dört hâli — `domain-core.B2bApplicationStatus`un tel karşılığı. */
export const B2bApplicationStatusEnum = z.enum(['none', 'pending', 'approved', 'rejected']);

/**
 * Bayrak İKİ uzunlukta konuşuyor ve ikisi de motordan geliyor (`b2bFlag`):
 * `label` kuyruk satırının tek kelimesi, `reason` kartın şeridindeki gerekçeli cümledir.
 *
 * Cümle tele konuyor çünkü onu ekranın kurması, aynı yargının liste/kart/masaüstünde üç ayrı
 * biçimde yazılması demekti — biri bir gün ötekinden başka bir sebep gösterirdi.
 */
export const B2bFlagSchema = z.object({ label: z.string(), tone: B2bSignalToneEnum, reason: z.string() });

/* ── KARAR KUYRUĞU (hub'ın karar kutusu — v2:331-357) ───────────────────────── */

/**
 * Kuyruk satır değil ALAN bazlıdır: her karar alanı canlı SAYISINI ve en taze örneğini taşır.
 * v2'nin beş satırı beş karar alanıdır; sıfır sayılı alan hub'da hiç çizilmez (ölü satır olurdu).
 * Alan içi dökümün tamamı hedef ekranın işidir — kuyruk bir yönlendirme kutusudur, liste değil.
 */
export const DecisionComplaintHeadSchema = z.object({
  ticketId: z.string().uuid(),
  type: TicketTypeEnum,
  customerName: z.string(),
  orderReferenceNo: z.string().nullable(),
  hasAttachment: z.boolean(),
  /** Son sözü müşteri söyledi — "top bizde" rozeti (`ticket_queue.awaiting_reply`). */
  awaitingReply: z.boolean(),
  lastMessageAt: z.string(),
  /**
   * Şikâyetin KENDİ cümlesi — son mesajın kırpılmış önizlemesi, operasyon dilinde çözülmüş
   * (`previewOf` + `resolveUserText`, kuyruk ekranıyla AYNI kural).
   *
   * Tasarımın koyu kartı (v3:2091) müşterinin adını değil DERDİNİ yazıyor ve haklı: yönetici
   * kartın önünde "bu ne kadar acil" diye karar veriyor, bir ad bunu söylemez. `null` = mesaj
   * gövdesi okunamadı; kart o hâlde adla yetinir, uydurma bir özet yazmaz.
   */
  preview: z.string().nullable(),
});
export type DecisionComplaintHead = z.infer<typeof DecisionComplaintHeadSchema>;

export const DecisionExceptionHeadSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  /** Eksik toplanan kalem sayısı — başlık "N kalem eksik" diye kurulsun diye. */
  shortLineCount: z.number().int().positive(),
  /**
   * En üstteki eksik kalemin künyesi (v3:2104 "Yoğurtlu Patlıcan 1000 g — depoda 1 adet eksik").
   * Kart "1 kalem eksik" derken hangi üründen söz ettiğini söylemiyordu; yönetici kararı ürünü
   * bilmeden veremez. Kalem sayısı birden çoksa kart "+N kalem daha" diye devam eder.
   */
  lineTitle: z.string(),
  missingQty: z.number().int().positive(),
});
export type DecisionExceptionHead = z.infer<typeof DecisionExceptionHeadSchema>;

/**
 * Yakın-SKT kartının künyesi (v3:2113 "Su Böreği · 6 adet · %30 öneri" · "2 gün kaldı").
 *
 * Aday listesinin **en acili** — kalan ömrü en az olan parti. Kuyruk bir liste değil yönlendirme
 * kutusudur (üstteki künye): kart tek örnek gösterir, dökümün tamamı teklif ekranındadır.
 */
export const DecisionOfferHeadSchema = z.object({
  title: z.string(),
  qty: z.number().int().nonnegative(),
  /** Son tarihe kalan gün; NEGATİF olabilir — DDM'si geçmiş parti hâlâ satılabilir (motor bilir). */
  daysLeft: z.number().int(),
  /** Ayardan gelen öneri oranı — kart "%30 öneri" diyebilsin diye (uydurma bir oran yazılmaz). */
  discountPercent: z.number(),
});
export type DecisionOfferHead = z.infer<typeof DecisionOfferHeadSchema>;

/**
 * Tedarik kartının künyesi (v3:2121 "Gaziantep · 7 kalem"). Tedarikçisi EŞLENMEMİŞ grup künye
 * olmaz: o gruptan sipariş açılamıyor ve kartın vaadi "onay bekliyor"du.
 */
export const DecisionSupplyHeadSchema = z.object({
  supplierName: z.string(),
  lineCount: z.number().int().positive(),
});
export type DecisionSupplyHead = z.infer<typeof DecisionSupplyHeadSchema>;

/**
 * Kurumsal başvuru kartının künyesi (v3:2634) — YALNIZ tek bekleyende dolu.
 *
 * Tasarım kartı iki hâlde konuşuyor: çoklu olunca "listeden seç · bayrak sırayı söyler", tekte
 * başvuranın adı ve bayrağı. Künye bu yüzden çokluda `null` — üç başvurudan birinin adını kartın
 * yüzü yapmak, ötekileri gizleyen bir seçim olurdu (aynı gerekçe teklif kartında "en acil"i
 * SEÇTİRİYOR; burada seçtirecek bir ölçüt yok, sıra bayrağın işi ve o listenin içinde).
 *
 * `customerId` taşınıyor çünkü tek başvuruda kart listeyi ATLAYIP doğrudan kontrol kartını açıyor
 * (kullanıcı 07.09, `B2bQueueView.single` ile aynı karar) — ekran kimliği ikinci bir turdan
 * öğrenmek zorunda kalmasın.
 */
export const DecisionB2bHeadSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string(),
  flag: B2bFlagSchema,
});
export type DecisionB2bHead = z.infer<typeof DecisionB2bHeadSchema>;

export const ManagementQueueSchema = z.object({
  /** Cevap bekleyen açık talepler (Y1). `head` en taze bekleyen; `null` = alan boş. */
  complaints: z.object({
    count: z.number().int().nonnegative(),
    head: DecisionComplaintHeadSchema.nullable(),
    /**
     * Karar kutusunun TALEP kartı (v3:28, 07.09) — *"6 açık · 2'si top bizde"* + tür kırılımı.
     *
     * `count` cevap BEKLEYENİ sayar (karar kutusunun rozeti, `countAwaiting`); bu ikisi kuyruğun
     * TAMAMINI anlatır ve kart onu yazıyor. Ayrı bir uçtan okunmadı: kart hub açılışında çiziliyor
     * ve ikinci bir tur, iki sayıyı iki ayrı andan okuturdu (sosyal kutucuğun aynı kararı).
     *
     * Kaynak `TicketQueueService.countForFilters` — talep listesinin şeridiyle AYNI sayım, yani
     * kart "6 açık" derken listenin "tümü · 6" demesi garanti.
     */
    open: z.number().int().nonnegative(),
    byType: z.record(TicketTypeEnum, z.number().int().nonnegative()),
  }),
  /** Eksik toplamalı hazırlıktaki siparişler (Y2 — D1'den düşer, karar admin'in). */
  exceptions: z.object({ count: z.number().int().nonnegative(), head: DecisionExceptionHeadSchema.nullable() }),
  /** Yakın-SKT teklif adayı partiler (Y3). Aday = SKT eşiğin altında ve teklif fiyatı henüz yok. */
  offers: z.object({
    candidateCount: z.number().int().nonnegative(),
    /** En acil aday (kalan ömrü en az); `null` = alan boş. */
    head: DecisionOfferHeadSchema.nullable(),
  }),
  /** Eşik altı tedarik önerisi (Y4) — tedarikçiye gruplu; eşlenmemiş varyant ayrı sayılır. */
  supply: z.object({
    groupCount: z.number().int().nonnegative(),
    unmappedVariantCount: z.number().int().nonnegative(),
    /** En kalabalık eşlenmiş grup; `null` = onaylanabilir grup yok (yalnız eşlenmemişler var). */
    head: DecisionSupplyHeadSchema.nullable(),
  }),
  /** Cevap bekleyen WhatsApp konuşmaları (Y6'nın kaynağı — sipariş niyeti bunların içinden çıkar). */
  intents: z.object({ count: z.number().int().nonnegative() }),
  /**
   * Onay bekleyen kurumsal hesap başvuruları (v3:2625). Sayaç kuyruğun `counts.pending`i, yani
   * LİSTENİN kendi sayacı — kutu "3 bekliyor" derken listenin sekmesinin 3 demesi garanti.
   */
  b2b: z.object({
    pendingCount: z.number().int().nonnegative(),
    head: DecisionB2bHeadSchema.nullable(),
  }),
});
export type ManagementQueue = z.infer<typeof ManagementQueueSchema>;

/* ── Y5 · GÜN ÖZETİ (v2:664-696) ────────────────────────────────────────────── */

/** Kanal kırılımı satırı. `cents: null` = ÖLÇÜLEMEDİ ve sıfır DEĞİLDİR (CLAUDE §1). */
export const SummaryChannelSchema = z.object({
  source: OrderSourceEnum,
  cents: z.number().int().nullable(),
});
export type SummaryChannel = z.infer<typeof SummaryChannelSchema>;

/** YZ içgörüsü — motoru modül 20/22'nin işi; bugün uç BOŞ dizi döner, sözleşme kapıyı açık tutar. */
export const DayInsightSchema = z.object({
  id: z.string(),
  tone: z.enum(['good', 'watch', 'bad']),
  text: z.string(),
});
export type DayInsight = z.infer<typeof DayInsightSchema>;

/**
 * Günün resmi tek okumada (doc 04 iş listesi: "parçalar hazır, birleştiren kapı yok" — bu o kapı).
 * "Gün" TESLİM günüdür (`delivery_date`): operasyonun günü teslim edilecek işle tanımlanır,
 * siparişin verildiği anla değil (sipariş listesi ve sayaçlarla aynı eksen — `order_counts`).
 */
export const ManagementSummarySchema = z.object({
  /** Özetin günü (YYYY-MM-DD) — ekran "bugün"ü buradan doğrular, kendi saatinden değil. */
  date: z.string(),
  orderCount: z.number().int().nonnegative(),
  preparingCount: z.number().int().nonnegative(),
  revenueCents: z.number().int(),
  openComplaintCount: z.number().int().nonnegative(),
  channels: z.array(SummaryChannelSchema),
  /** Bekleyen tahsilat (ödemesi düşmemiş günün siparişleri): adet + kalan tutar. */
  pendingPayment: z.object({ count: z.number().int().nonnegative(), cents: z.number().int() }),
  /**
   * Yarının resmi. "Rotaya atanmamış" BİLEREK yok: sefer sabah kurulur (`delivery_run.start`),
   * bugünden "yarın atanmamış" saymak henüz sorulmamış bir soruya cevap uydurmak olurdu.
   */
  tomorrow: z.object({
    orderCount: z.number().int().nonnegative(),
    readyCount: z.number().int().nonnegative(),
    doorPaymentCents: z.number().int(),
  }),
  insights: z.array(DayInsightSchema),
});
export type ManagementSummary = z.infer<typeof ManagementSummarySchema>;

/** Hub'ın tek zarfı: karar kutusu + özetin başlık şeridi aynı istekle gelir (tek ekran, tek tur). */
export const ManagementHubSchema = z.object({
  queue: ManagementQueueSchema,
  summary: ManagementSummarySchema,
});
export type ManagementHub = z.infer<typeof ManagementHubSchema>;

/* ── Y3 · YAKIN-SKT TEKLİF ONAYI (v2:338-342) ───────────────────────────────── */

/**
 * Teklif adayı parti — raf ömrü motoru "teklife açılabilir" diyor (`can_offer`) ve parti henüz
 * teklifte değil. Öneri fiyatı ve indirim yüzdesi AYARDAN türer ve satırla birlikte taşınır
 * (`batch-view` künyesi): ekran eşiği yeniden okumaz, sabit yazmaz.
 */
export const OfferCandidateSchema = z.object({
  stockId: z.string().uuid(),
  /** "Fıstıklı Baklava · 1 kg" — dil yedek zinciri sunucuda çözülür (operasyon dili). */
  title: z.string(),
  lotNumber: z.string().nullable(),
  qty: z.number().int().nonnegative(),
  /** Son tarihe kalan gün — geçmişse negatif (satılabilir pencerede olabilir, motor bilir). */
  daysLeft: z.number().int(),
  /**
   * Raf ömrünün kalan YÜZDESİ (v3:30 — *"Kalan ömür 2 gün · %18"*). Günün yanında durur çünkü
   * ikisi ayrı şey söyler: "2 gün" ne kadar zaman kaldığını, "%18" partinin ömrünün ne kadarını
   * TÜKETTİĞİNİ. Bir haftalık peynirde 2 gün rahat, üç aylık konservede aynı 2 gün alarmdır.
   *
   * Ürünün raf ömrü tanımsızsa `null` — SIFIR DEĞİL (CLAUDE §1): sıfır "ömrü bitti" demektir ve
   * ölçemediğimiz partiyi imhalık gibi okuturdu. Ekran `null`da yüzdeyi hiç yazmaz.
   */
  remainingPercent: z.number().nullable(),
  listPriceCents: z.number().int().nullable(),
  /** Liste fiyatı yoksa öneri de yok (`null`) — uydurulmaz; operatör fiyatı elle yazar. */
  suggestedCents: z.number().int().nullable(),
  offerDiscountPercent: z.number(),
  /** Partinin durduğu depo; ad çözülemediyse `null` ve ekran depo SÖYLEMEZ (uydurmaz). */
  warehouse: z.object({ code: z.string(), name: z.string() }).nullable(),
});
export type OfferCandidate = z.infer<typeof OfferCandidateSchema>;

export const OfferCandidatesResponseSchema = z.object({
  candidates: z.array(OfferCandidateSchema),
});
export type OfferCandidatesResponse = z.infer<typeof OfferCandidatesResponseSchema>;

/** Onay tek turda birden çok partiyi teklife açar; fiyat operatörün son sözüdür (öneri düzeltilebilir). */
export const OfferOpenRequestSchema = z.object({
  items: z
    .array(z.object({ stockId: z.string().uuid(), offerPriceCents: z.number().int().positive() }))
    .min(1)
    .max(50),
});
export type OfferOpenRequest = z.infer<typeof OfferOpenRequestSchema>;

/**
 * Parti başına AKIBET — olumsuzu bir HTTP hatası değil cevaptır (200 + gövde): listede 3 parti
 * varken biri arada tükendiyse kalan ikisi yine açılır ve operatör hangisinin neden açılmadığını
 * satır satır görür. `must_discard`: DLC geçmiş — satılamaz, yalnız imha (kapı sunucuda, ekranın
 * iyi niyetine bırakılmaz — web `offer-actions` ile AYNI motor).
 */
export const OfferOpenResultSchema = z.object({
  stockId: z.string().uuid(),
  status: z.enum(['ok', 'not_found', 'must_discard']),
});
export type OfferOpenResult = z.infer<typeof OfferOpenResultSchema>;

export const OfferOpenResponseSchema = z.object({ results: z.array(OfferOpenResultSchema) });
export type OfferOpenResponse = z.infer<typeof OfferOpenResponseSchema>;

/* ── Y4 · TEDARİK ÖNERİSİ (v2:354-357) ──────────────────────────────────────── */

/** Başka tesiste duran adet — TRANSFER seçeneğinin ham verisi, kararı değil (v2:648). */
export const SupplyElsewhereSchema = z.object({
  warehouseCode: z.string(),
  qty: z.number().int().positive(),
});
export type SupplyElsewhere = z.infer<typeof SupplyElsewhereSchema>;

export const SupplyLineSchema = z.object({
  variantId: z.string().uuid(),
  title: z.string(),
  availableQty: z.number().int(),
  minStockQty: z.number().int(),
  /** Yoldaki düşülmüş, koli katına yuvarlı — motorun sözü (`ReorderService` künyesi). */
  suggestedQty: z.number().int(),
  incomingQty: z.number().int().nonnegative(),
  lastPurchaseCents: z.number().int().nullable(),
  elsewhere: z.array(SupplyElsewhereSchema),
});
export type SupplyLine = z.infer<typeof SupplyLineSchema>;

export const SupplyGroupSchema = z.object({
  /** `null` = tedarikçisi eşlenmemiş grup — sipariş AÇILAMAZ, ekranda soluk durur (v2:657). */
  supplierId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  warehouseId: z.string().uuid(),
  warehouseCode: z.string().nullable(),
  lines: z.array(SupplyLineSchema).min(1),
});
export type SupplyGroup = z.infer<typeof SupplyGroupSchema>;

export const SupplyResponseSchema = z.object({ groups: z.array(SupplyGroupSchema) });
export type SupplyResponse = z.infer<typeof SupplyResponseSchema>;

/**
 * Grup onayı = TASLAK TS. Kalem listesi GÖVDEDE YOK ve bu bilinçli: sunucu öneriyi onay anında
 * yeniden hesaplar — bayat bir ekranın kalemlerini kayda geçirmek, stoktaki değişikliği yok saymak
 * olurdu. Sistem tedarikçiye bir şey GÖNDERMEZ (DOMAIN §16); referans gönderimde doğar.
 */
export const SupplyDraftRequestSchema = z.object({
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid(),
});
export type SupplyDraftRequest = z.infer<typeof SupplyDraftRequestSchema>;

export const SupplyDraftResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    purchaseOrderId: z.string().uuid(),
    itemCount: z.number().int().positive(),
  }),
  /** Onay anında bu tedarikçi için eşik altı kalem kalmamış — ekran bayat; hata değil, cevap. */
  z.object({ status: z.literal('no_suggestion') }),
]);
export type SupplyDraftResponse = z.infer<typeof SupplyDraftResponseSchema>;

/* ── Y1 · ŞİKÂYET / TALEP DETAYI (v2:530-579) ───────────────────────────────── */

/**
 * Yazışmadaki tek mesaj — personel gözünden: gövde OPERASYON dilinde (çeviri uçta çözülür,
 * `getStaffTicketDetail`), müşterinin aslı `originalBody`de ("orijinali gör" onu açar).
 */
export const ComplaintMessageSchema = z.object({
  id: z.string().uuid(),
  sender: TicketSenderEnum,
  body: z.string(),
  /** Gövde makine çevirisi mi — değilse "orijinal" düğmesi çizilmez (aynı metin iki kez açılmaz). */
  bodyTranslated: z.boolean(),
  originalBody: z.string(),
  /** Müşterinin yazdığı dil (kod, ör. "fr") — etiket yüzeyde kurulur. */
  language: z.string().nullable(),
  /** Yalnız personel mesajında: yazan kişinin adı ("OPERATÖR · Selim"). */
  authorName: z.string().nullable(),
  attachmentUrls: z.array(z.string()),
  createdAt: z.string(),
});
export type ComplaintMessage = z.infer<typeof ComplaintMessageSchema>;

export const ComplaintDetailSchema = z.object({
  ticketId: z.string().uuid(),
  type: TicketTypeEnum,
  status: TicketStatusEnum,
  source: TicketSourceEnum,
  handledBy: TicketHandlerEnum,
  awaitingReply: z.boolean(),
  customerName: z.string(),
  orderReferenceNo: z.string().nullable(),
  lastMessageAt: z.string(),
  /** Hibrit modun bekleyen YZ taslağı — operatör cevabı DEĞİLDİR; tüketilince düşer (16.5). */
  aiDraftReply: z.string().nullable(),
  messages: z.array(ComplaintMessageSchema).min(1),
});
export type ComplaintDetail = z.infer<typeof ComplaintDetailSchema>;

/** `complaint: null` = talep yok (ya da `next` istendi ve bekleyen kalmadı) — 404 değil, cevap. */
export const ComplaintResponseSchema = z.object({ complaint: ComplaintDetailSchema.nullable() });
export type ComplaintResponse = z.infer<typeof ComplaintResponseSchema>;

/* ── TALEP LİSTESİ (21.281 · v3:29 "Talep ve şikâyetler") ───────────────────────────────────── */

/**
 * Kuyruk satırı — TARAMA için gereken her şey, tek turda.
 *
 * Detayın (`ComplaintDetailSchema`) küçültülmüşü DEĞİL ve olmamalı: detay yazışmayı, sipariş
 * zeminini ve müşteri bağlamını taşır; liste bunların hiçbirini taramak için gerektirmez ve
 * taşısaydı altı satır için altı yazışma çekilirdi.
 *
 * Alanlar `TicketQueueItem`ın (uygulama katmanı) tel karşılığıdır — ekranın çizdiği her rozetin
 * bir kaynağı var: tür rozeti `type`, "top bizde" `awaitingReply`, "kapandı" `status`, alt şerit
 * `hasAttachment` + `previewLanguage`/`previewTranslated`.
 */
export const ComplaintRowSchema = z.object({
  ticketId: z.string().uuid(),
  type: TicketTypeEnum,
  status: TicketStatusEnum,
  customerName: z.string(),
  /** Son mesajın kırpılmış önizlemesi, operasyon dilinde çözülmüş. */
  preview: z.string(),
  previewTranslated: z.boolean(),
  /**
   * Önizlemenin KAYNAK dili — "çeviri var" tek başına eksik bir cümle (21.281 künyesi,
   * `TicketQueueItem`). `null` = dil saptanmamış; ekran o zaman susar.
   */
  previewLanguage: SourceLanguageSchema.nullable(),
  lastMessageAt: z.string(),
  awaitingReply: z.boolean(),
  /**
   * Ek VAR MI — kaç tane DEĞİL (kullanıcı kararı 07.09). Tasarım "2 görsel" yazıyor ama görünüm
   * `bool_or(cardinality(...))` taşıyor; sayı için şema değişmesi gerekirdi ve sayı tarama
   * kararını değiştirmiyor — operatör zaten açacak.
   */
  hasAttachment: z.boolean(),
  orderReferenceNo: z.string().nullable(),
});
export type ComplaintRow = z.infer<typeof ComplaintRowSchema>;

/**
 * `GET /management/complaints` yanıtı — sayfa + şerit sayaçları TEK turda.
 *
 * `counts` her sayfada gelir (sosyal gelen kutusunun aynı kararı): sayaç SAYIMDIR, sayfa uzunluğu
 * değil, ve ayrı bir uç aynı ekran açılışına ikinci tur ekleyip iki değeri farklı anlardan
 * okuturdu. Devam sayfasında ekran onları yok sayar.
 */
export const ComplaintsResponseSchema = z.object({
  rows: z.array(ComplaintRowSchema),
  /** Keyset imleci — telde OPAK dize; istemci yorumlamaz, aynen geri verir. `null` = liste bitti. */
  nextCursor: z.string().nullable(),
  counts: z.object({
    /** Açık kuyruğun tamamı (`open` + `in_progress`) — türlerin toplamı. */
    all: z.number().int().nonnegative(),
    byType: z.record(TicketTypeEnum, z.number().int().nonnegative()),
    awaiting: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
  }),
});
export type ComplaintsResponse = z.infer<typeof ComplaintsResponseSchema>;

export const ComplaintReplyRequestSchema = z.object({ body: z.string().trim().min(1) });
export type ComplaintReplyRequest = z.infer<typeof ComplaintReplyRequestSchema>;

/**
 * Talebin DURUMUNU değiştir (v3:30'un aksiyon çekmecesi · 21.276).
 *
 * **`/claim` ucunun yerine geçti ve o kalkTI.** Eski uç gövdesiz bir POST'tu ve hedefi kendi
 * içinde `in_progress` diye SABİTLİYORDU; çekmece üç geçişi birden istiyor (üstlen · çöz ·
 * yeniden aç) ve ikinci bir uç açmak aynı motor çağrısına (`changeTicketStatus`) iki kapı
 * açmak olurdu (CLAUDE §1). Niyet artık çağıranın: ekran hangi düğmeye basıldığını bilir,
 * uç yalnız hedefi taşır.
 *
 * Hangi geçişin geçerli olduğunu **motor** söyler (`canTransitionTicket`), ekran hesaplamaz —
 * uç geçersiz hedefi `ok:false` + sebeple reddeder, HTTP hatasıyla değil.
 */
export const ComplaintStatusRequestSchema = z.object({ to: TicketStatusEnum });
export type ComplaintStatusRequest = z.infer<typeof ComplaintStatusRequestSchema>;

/**
 * Yürütücü modu — çekmecenin "ASİSTAN MODU" bölümü (v3:30).
 *
 * Üç değer de operatörün AÇIK kararıyla seçilir; tasarım ikisini çiziyor (insan · hibrit) ama
 * sözleşme enum'un tamamını taşıyor — kısıtlama EKRANIN kararıdır, verinin değil.
 */
export const ComplaintModeRequestSchema = z.object({ mode: TicketHandlerEnum });
export type ComplaintModeRequest = z.infer<typeof ComplaintModeRequestSchema>;

/**
 * Talep türünün düzeltilmesi — çekmecenin "TALEP TÜRÜ" bölümü (v3:30).
 *
 * Tür bir SINIFLANDIRMADIR, durum değil: iş akışını değiştirmez, kuyruğun süzgeçlerini besler.
 * Ölçüldü (06.09): türü okuyan tek karar noktası `isReturnBound` ve o bir işaret, yasak değil —
 * `canTriggerReturn` türe hiç bakmıyor. Yani sonradan düzeltmek geçmişi tutarsız bırakmıyor.
 */
export const ComplaintTypeRequestSchema = z.object({ type: TicketTypeEnum });
export type ComplaintTypeRequest = z.infer<typeof ComplaintTypeRequestSchema>;

/** Yazma kapılarının ortak zarfı — red bir CÜMLEDİR (`TicketWriteResult` deseni), HTTP hatası değil. */
export const TicketActionResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.string().nullable(),
});
export type TicketActionResponse = z.infer<typeof TicketActionResponseSchema>;

export const ComplaintDraftRequestSchema = z.object({
  /** true = taslak OLDUĞU GİBİ cevap olur; false = taslak düşer, metin cevap kutusuna taşınır. */
  send: z.boolean(),
});
export type ComplaintDraftRequest = z.infer<typeof ComplaintDraftRequestSchema>;

export const ComplaintDraftResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.string().nullable(),
  /** Tüketilen taslağın metni — `send=false` yolunda ekran bunu cevap kutusuna koyar. */
  draft: z.string().nullable(),
});
export type ComplaintDraftResponse = z.infer<typeof ComplaintDraftResponseSchema>;

/* ── Y2 · SİPARİŞ İSTİSNASI — EKSİK TOPLAMA (v2:581-610) ────────────────────── */

/**
 * Eksik kalemin karar satırı. `advice` MOTORUN sözüdür (`suggestShortfallAction` — oran/tutar
 * eşikleri ayardan): ekran hesaplamaz, motora sorar. Para admin ekranında GÖRÜNÜR (doc 04: "para
 * bilgisi BU ekranda görünebilir, D1'de değil").
 */
export const ExceptionLineSchema = z.object({
  orderItemId: z.string().uuid(),
  title: z.string(),
  orderedQty: z.number().int().positive(),
  pickedQty: z.number().int().nonnegative(),
  missingQty: z.number().int().positive(),
  unitPriceCents: z.number().int(),
  missingValueCents: z.number().int(),
  advice: z.object({
    action: z.enum(['ask_customer', 'send_rest']),
    reason: z.string(),
  }),
});
export type ExceptionLine = z.infer<typeof ExceptionLineSchema>;

export const OrderExceptionSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  customerName: z.string(),
  status: OrderStatusEnum,
  totalCents: z.number().int(),
  lines: z.array(ExceptionLineSchema).min(1),
});
export type OrderException = z.infer<typeof OrderExceptionSchema>;

export const ExceptionsResponseSchema = z.object({ exceptions: z.array(OrderExceptionSchema) });
export type ExceptionsResponse = z.infer<typeof ExceptionsResponseSchema>;

/**
 * "Müşteriye sor" akıbeti — dördü de CEVAP (200): `no_shortfall` = ekran bayat (eksik kapanmış),
 * `already_asked` = çift soru koruması kapıda (aynı kaleme ikinci talep açılmaz, 10.3).
 */
export const ExceptionAskResponseSchema = z.object({
  status: z.enum(['ok', 'not_found', 'no_shortfall', 'already_asked']),
  ticketId: z.string().uuid().nullable(),
});
export type ExceptionAskResponse = z.infer<typeof ExceptionAskResponseSchema>;

/*
  ── Y? · KURUMSAL HESAP BAŞVURUSU (21.217) ──────────────────────────────────

  Tel şeması BURADA, görünüm tipi `@lezzet/application`da (`B2bCheckView`) — ve bu ayrım bilinçli,
  web şeridinin ölçtüğü gerekçeyle: görünüm motorun tiplerini taşıyor (`B2bSignal`,
  `B2bApplicationStatus`, `SignalTone` → `domain-core`) ve `types` motorun ALTINDA duruyor, yani
  bağımlılık tek yönlü kalsın diye tip yukarı çıkamadı (STACK §4). Emsali `CourierStop`: uygulama
  katmanının dışa verdiği görünüm, uçta sarılıyor.

  Uç `const body: z.input<typeof …> = view` diye sarıyor; görünümden bir alan düşerse DERLEME
  kırılıyor, ekran değil.
*/

/* Bölümün üç ilkeli (`B2bSignalToneEnum` · `B2bApplicationStatusEnum` · `B2bFlagSchema`) DOSYANIN
   BAŞINDA duruyor — karar kutusunun B2B kartı da onları okuyor ve şema değerlendirmesi yukarıdan
   aşağı yapılıyor (aşağıda kalsalardı kutu şeması tanımlanmamış bir değere bakardı). */

/**
 * KUYRUK SATIRI (brief `§2b`) — dört alan: ad · bayrak · şehir · yaş.
 *
 * **Bayrak satırda ve bu ölçülmüş bir karar (kullanıcı 07.09):** onsuz liste "kaç tane var"ı söyler,
 * "önce hangisi"ni söylemez ve sıralama yalnız YAŞA kalır — oysa temiz bir başvuru on saniyede
 * kapanır, mükerrer olan masaya kalır. Ucuz bir bayrak (mükerrer girdisi olmadan) elendi: liste
 * "Temiz" derken detay "Mükerrer" diyebilirdi ve ekran operatörü açmadan onaylamaya davet ederdi.
 * Bayrak KARTLA AYNI hesaptan geliyor (`readB2bCheck` → `b2bFlag`), yani iki yüzey ayrışamaz.
 */
export const B2bQueueRowSchema = z.object({
  customerId: z.string().uuid(),
  name: z.string(),
  /** Kuyrukta ayırt edici; `null` = kayıtlı adresi yok. */
  city: z.string().nullable(),
  /** Şehrin yanında (`şehir · ülke · yaş`) — FR/DE ayrımı sinyallerin okunuşunu değiştiriyor. */
  country: CountryEnum,
  /** Başvurunun geldiği an (ISO) — ekran yaşı buradan yazar. `null` = damga yok (eski kayıt). */
  appliedAt: z.string().nullable(),
  flag: B2bFlagSchema,
  /**
   * Başvurunun hâli — "Karar verilmiş" sekmesinde satır bunu ayrı bir rozetle yazıyor.
   *
   * Bekleyen sekmesinde daima `pending` ve rozet çizilmiyor: her satırda aynı şeyi tekrarlayan bir
   * rozet, bilgi değil gürültüdür. Alan yine de HER satırda dolu — sekme değişince ekranın ikinci
   * bir okumaya gitmesi gerekmesin.
   */
  status: B2bApplicationStatusEnum,
});
export type B2bQueueRow = z.infer<typeof B2bQueueRowSchema>;

/**
 * Hangi sekme okunuyor. `decided` = onaylanmış VE reddedilmiş birlikte — tasarımın sekmesi de tek:
 * *"Karar verilmiş"*. İkiye bölmek, operatörün aradığı şeyi ("bunu neden reddetmişiz") iki sekmeye
 * dağıtırdı.
 */
export const B2bQueueFilterEnum = z.enum(['pending', 'decided']);

export const B2bQueueQuerySchema = z.object({
  filter: B2bQueueFilterEnum.optional().default('pending'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * Kuyruk cevabı. `total` SAYFANIN değil KÜMENİN sayısı: başlık *"2 bekleyen başvuru"* diyor ve o
 * cümle sayfa boyuna göre değişemez.
 *
 * **`single` — tek kayıtta listeyi atlama kuralı (kullanıcı 07.09).** Ekranın bu kararı kendi
 * sayması gerekmesin diye uç söylüyor: tek satırlık bir liste operatöre bir dokunuş fazladan
 * ödetip hiçbir şey söylemez. Sayfalanmış bir listede "kaç tane var" sorusunun cevabı istemcide
 * `rows.length` DEĞİLDİR — ilk sayfa doluysa yanlış cevap verir.
 */
export const B2bQueueResponseSchema = z.object({
  rows: z.array(B2bQueueRowSchema),
  nextCursor: z.string().nullable(),
  /**
   * İKİ SEKMENİN SAYACI, süzgeç ne olursa olsun ikisi de dolu — tasarım sekme başlıklarına
   * sayıyı yazıyor (*"Bekliyor · 2"* · *"Karar verilmiş · 7"*) ve okunmayan sekmenin sayısı
   * boş kalırsa operatör oraya basmadan ne olduğunu bilemez.
   */
  counts: z.object({ pending: z.number().int(), decided: z.number().int() }),
  /**
   * Tek bekleyen başvuru varsa onun kimliği; ekran listeyi atlayıp doğrudan açar (kullanıcı kararı
   * 07.09). Yalnız `pending` süzgecinde anlamlı — "karar verilmiş"te tek kayıt olması bir kestirme
   * sebebi değildir, orası bir arşiv.
   */
  single: z.string().uuid().nullable(),
});
export type B2bQueueResponse = z.infer<typeof B2bQueueResponseSchema>;

/** Sinyal satırı — etiket + okunur değer + ton. Renk tek başına anlam taşımıyor, etiket okunuyor. */
export const B2bSignalSchema = z.object({
  label: z.string(),
  value: z.string(),
  tone: B2bSignalToneEnum,
});

/** Mükerrer ADAYI — kesinlik iddiası yok; ekranın sorusu "aynı kişi olabilir mi". */
export const B2bDuplicateRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  /** Taslak kayıt (WhatsApp telefonuyla açılmış) — mükerrer adaylarının en sık kaynağı. */
  isDraft: z.boolean(),
});

/**
 * KONTROL KARTI — `@lezzet/application.B2bCheckView`in tel karşılığı.
 *
 * Alanlar elle EŞLENMİYOR: uç `const body: z.input<typeof …> = view` diye sarıyor, yani görünümden
 * bir alan düşerse ya da adı değişirse DERLEME kırılıyor — ekran değil. Aynı desen `CourierStop`ta.
 */
export const B2bCheckSchema = z.object({
  customerId: z.string().uuid(),
  /** İŞLETMENİN adı (künye adı; yoksa hesabın adı) — kartın ve kuyruk satırının başlığı. */
  name: z.string(),
  /**
   * Hesabın sahibi (kullanıcı bulgusu 08.09). Başlık işletmeye geçince kişi kaybolmasın diye ayrı
   * alan: kapıda aranacak, mükerrer şüphesinde bakılacak ve "kim başvurdu" sorusunun cevabı odur.
   */
  contactName: z.string(),
  /** Resmî künye adı — ticari addan farklı olabilir. */
  legalName: z.string().nullable(),
  /**
   * Şirketin kimlik numarası KENDİ ADIYLA — etiket ülkeye göre değişir (FR `SIRET`, DE `USt-IdNr`)
   * ve `source` numaranın resmî kayıttan mı, başvuranın elinden mi geldiğini söyler.
   *
   * Bir tur çıplak `siret: string | null` idi; o alan hem Alman başvurunun KDV numarasını yanlış
   * adla etiketliyor, hem SIRET'i olmayan başvurunun numarasını kartta hiç göstermiyordu.
   */
  identity: z.object({ label: z.string(), value: z.string(), source: z.string() }).nullable(),
  country: CountryEnum,
  phone: z.string().nullable(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  /** Başvurunun geldiği an (ISO) — kart künyesi yaşı bundan yazıyor. `null` = damga yok. */
  appliedAt: z.string().nullable(),
  mapsHref: z.string().nullable(),
  status: B2bApplicationStatusEnum,
  signals: z.array(B2bSignalSchema),
  flag: B2bFlagSchema,
  duplicates: z.array(B2bDuplicateRowSchema),
});

/** `check: null` = müşteri yok (bildirim bayat, kayıt silinmiş). Ekran "bulunamadı" çizer. */
export const B2bCheckResponseSchema = z.object({ check: B2bCheckSchema.nullable() });
export type B2bCheckResponse = z.infer<typeof B2bCheckResponseSchema>;

/**
 * ASİSTAN ÖZETİ — karttan AYRI okunuyor ve bu ayrım taşıyıcı: model çağrısı saniye mertebesinde,
 * kartın açılışı onu beklemez (künye `application/b2b/summary.ts`).
 *
 * `summary: null` = özet üretilemedi ve bu bir ARIZA DEĞİL: anahtar yapılandırılmamış olabilir,
 * sağlayıcı düşmüş olabilir. Ekran o hâlde kartı eksik çizmez — sinyaller zaten yukarıda.
 * Sebep tele KOYULMUYOR: operatörün yapacağı şey her iki hâlde de aynı, ayrım sunucunun kaydında
 * kalır (`captureError`); ekrana taşımak, hakkında bir şey yapılamayacak bir ayrıntı göstermektir.
 */
export const B2bSummaryResponseSchema = z.object({ summary: z.string().nullable() });
export type B2bSummaryResponse = z.infer<typeof B2bSummaryResponseSchema>;

/**
 * RET SEBEBİ ZORUNLU (`min(1)`) — ret SİLMEZ: kayıt B2C olarak yaşamaya devam eder ve aday künyesini
 * düzeltip yeniden başvurabilir. Sebep, "bunu neden reddetmişiz" sorusunun altı ay sonraki cevabıdır;
 * boş bırakılabilseydi o cevap hiç yazılmazdı.
 */
export const B2bRejectRequestSchema = z.object({ reason: z.string().trim().min(1).max(500) });

/**
 * Onay/ret sonucu. `status` KARARDAN SONRAKİ hâl — ekran ikinci bir okumaya gitmeden rozetini
 * güncelliyor. `not_found` = kayıt yok; `already_decided` = başka bir telefon araya girdi ve
 * ekranın gördüğü hâl bayat (karar İKİLENMEDİ).
 */
export const B2bDecisionResponseSchema = z.object({
  result: z.enum(['ok', 'not_found', 'already_decided']),
  status: B2bApplicationStatusEnum.nullable(),
});
export type B2bDecisionResponse = z.infer<typeof B2bDecisionResponseSchema>;
