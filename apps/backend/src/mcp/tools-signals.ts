import {
  AnalyticsProductDailyService,
  AnalyticsSearchDailyService,
  ConversationInboxService,
  PostalCodeDemandService,
  ProductFeedbackService,
  ProductService,
  TicketService,
  serviceDb,
} from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * Talep sinyalleri ve müşteri nabzı (22.1 · Faz A) — kullanıcının açıkça istediği iki gündem
 * kalemini besleyen ham veri: **"haftalık yeni rota önerisi"** (hangi posta kodu soruluyor ama
 * kapsanmıyor) ve **"müşteri taleplerine göre paket önerisi"** (ne aranıyor, ne bakılıp
 * alınmıyor, hangi aday ürün isteniyor).
 *
 * **Sinyal veridir, karar değil.** Araç "şu kodu bölgeye ekle" demez, "şu kod 14 kez soruldu,
 * kapsanmıyor" der; öneriyi model kurar, kararı patron verir (onay kuyruğu Faz B).
 *
 * **Kimlik yok** (`AI_ADMIN_ASSISTANT §6`): talep sayacı zaten anonim; yazışma ve talep tarafında
 * yalnız SAYIM ve durum kırılımı okunur — konuşma metni, müşteri adı, telefon hiçbir araca girmez.
 * Bu, MCP asistanının mesajlaşmadaki rolünün GÖZLEM olmasının kod karşılığıdır (§7 tablosu).
 */

/** Paris takviminde n gün önce (YYYY-AA-GG) — analitik özetler gün taneli. */
function daysAgo(days: number): string {
  const today = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const anchor = new Date(`${today}T12:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() - days);
  return anchor.toISOString().slice(0, 10);
}

function today(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/**
 * Talep sinyalleri: nereye gidemiyoruz, ne aranıp bulunamıyor, ne çok bakılıp az alınıyor.
 *
 * Üçü de aynı soruya bakar — **karşılanmamış talep** — ama üç ayrı yerden: coğrafya, arama kutusu,
 * ürün sayfası. Tek bir araçta toplanmaları bilinçli: asistan "bu hafta ne yapmalıyım" diye
 * sorduğunda üçünü birden görmeli, üç ayrı çağrı yapıp birleştirmeye çalışmamalı.
 */
export async function demandSignals(days: number) {
  const clamped = Math.max(1, Math.min(90, Math.floor(days)));
  const db = serviceDb();
  const from = daysAgo(clamped - 1);
  const to = today();

  const [zones, searches, zeroSearches, productSignals] = await Promise.all([
    new PostalCodeDemandService(db).listTop(15),
    new AnalyticsSearchDailyService(db).signals(from, to, 15),
    // Sonuçsuz aramalar AYRI sorulur: "aradı ve bulamadı" bir katalog boşluğudur — paket ve yeni
    // ürün önerisinin en dolaysız kanıtı.
    new AnalyticsSearchDailyService(db).signals(from, to, 15, true),
    new AnalyticsProductDailyService(db).signals(from, to, 15),
  ]);

  // Ürün kimlikleri ADA çevrilir: model uuid'yle konuşamaz, patron da öyle.
  const products = productSignals.length > 0 ? await new ProductService(db).listByIds(productSignals.map((s) => s.productId)) : [];
  const nameById = new Map(products.map((p) => [p.id, resolveLocalizedText(p.name, 'tr')]));

  return {
    window: { from, to, days: clamped },
    // Rota/bölge önerisinin ham sinyali (19.21 · anonim sayaç).
    postalCodeDemand: zones.map((z) => ({ postalCode: z.postalCode, requestCount: z.requestCount, lastSeenAt: z.lastSeenAt })),
    searches: searches.map((s) => ({ query: s.query, searchCount: s.searchCount, sessionCount: s.sessionCount })),
    searchesWithoutResult: zeroSearches.map((s) => ({ query: s.query, kind: s.zeroResultKind, searchCount: s.searchCount })),
    // `cartRate` null = "hiç satılabilir hâlde görünmedi" — SIFIR DEĞİL (ölçüm yoksa yokluk yazılır).
    productInterest: productSignals.map((s) => ({
      product: nameById.get(s.productId) ?? '(silinmiş ürün)',
      viewCount: s.viewCount,
      cartCount: s.cartCount,
      cartRate: s.cartRate,
    })),
  };
}

/**
 * Müşteri nabzı — talepler, moderasyon kuyruğu ve YAZIŞMA GÖZLEMİ.
 *
 * Yazışma tarafı bilerek SAYIMDIR: MCP asistanı mesajlaşmayı yönetmez, gözlemler (kullanıcı
 * kararı 09.08 · `AI_CUSTOMER_AGENT §7`). "Kaç konuşma cevap bekliyor" sorusunun cevabı patronun
 * işine yarar; konuşmanın İÇERİĞİ ise müşteri ajanının ve operasyon ekranının alanıdır.
 */
export async function customerPulse() {
  const db = serviceDb();
  const [tickets, pendingReviews, awaitingReply] = await Promise.all([
    new TicketService(db).countByStatus(),
    new ProductFeedbackService(db).countPending(),
    new ConversationInboxService(db).countAwaitingReply(),
  ]);

  return {
    tickets,
    pendingReviews,
    conversations: { awaitingReply },
  };
}
