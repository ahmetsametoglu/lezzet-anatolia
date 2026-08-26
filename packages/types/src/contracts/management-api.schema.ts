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
