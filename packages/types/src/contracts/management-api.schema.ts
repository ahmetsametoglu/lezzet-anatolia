import { z } from 'zod';
import {
  OrderSourceEnum,
  OrderStatusEnum,
  TicketHandlerEnum,
  TicketSenderEnum,
  TicketSourceEnum,
  TicketStatusEnum,
  TicketTypeEnum,
} from '../primitives/enums.schema';

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

export const ManagementQueueSchema = z.object({
  /** Cevap bekleyen açık talepler (Y1). `head` en taze bekleyen; `null` = alan boş. */
  complaints: z.object({ count: z.number().int().nonnegative(), head: DecisionComplaintHeadSchema.nullable() }),
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

export const ComplaintReplyRequestSchema = z.object({ body: z.string().trim().min(1) });
export type ComplaintReplyRequest = z.infer<typeof ComplaintReplyRequestSchema>;

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
