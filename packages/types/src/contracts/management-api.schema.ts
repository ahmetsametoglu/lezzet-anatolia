import { z } from 'zod';
import { OrderSourceEnum, TicketTypeEnum } from '../primitives/enums.schema';

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
});
export type DecisionComplaintHead = z.infer<typeof DecisionComplaintHeadSchema>;

export const DecisionExceptionHeadSchema = z.object({
  orderId: z.string().uuid(),
  referenceNo: z.string().nullable(),
  /** Eksik toplanan kalem sayısı — başlık "N kalem eksik" diye kurulsun diye. */
  shortLineCount: z.number().int().positive(),
});
export type DecisionExceptionHead = z.infer<typeof DecisionExceptionHeadSchema>;

export const ManagementQueueSchema = z.object({
  /** Cevap bekleyen açık talepler (Y1). `head` en taze bekleyen; `null` = alan boş. */
  complaints: z.object({ count: z.number().int().nonnegative(), head: DecisionComplaintHeadSchema.nullable() }),
  /** Eksik toplamalı hazırlıktaki siparişler (Y2 — D1'den düşer, karar admin'in). */
  exceptions: z.object({ count: z.number().int().nonnegative(), head: DecisionExceptionHeadSchema.nullable() }),
  /** Yakın-SKT teklif adayı partiler (Y3). Aday = SKT eşiğin altında ve teklif fiyatı henüz yok. */
  offers: z.object({ candidateCount: z.number().int().nonnegative() }),
  /** Eşik altı tedarik önerisi (Y4) — tedarikçiye gruplu; eşlenmemiş varyant ayrı sayılır. */
  supply: z.object({
    groupCount: z.number().int().nonnegative(),
    unmappedVariantCount: z.number().int().nonnegative(),
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
