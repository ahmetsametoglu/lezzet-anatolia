import { generateConversationDraft, generateTicketDraft, runAutonomousTicketReply, type SupportAiOutcome } from '@lezzet/application';
import { ConversationInboxService, TicketQueueService, serviceDb, type Db } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';

export const SUPPORT_AI = 'support_ai';

/**
 * **AI DESTEK TURU** (16.5 · 20.4) — üç tarama, tek iş:
 *
 *   1. Modu `ai` olan, cevap bekleyen talepler → ÖZERK cevap (ya da insana devir).
 *   2. Modu `hybrid` olan, cevap bekleyen talepler → TASLAK üretimi (`ai_draft_reply`).
 *   3. Modu `hybrid` olan, cevap bekleyen WhatsApp konuşmaları → taslak üretimi.
 *
 * Üçü tek işte, çünkü frenleri ortak: koşu başına toplam çağrı tavanı (`BATCH`) ve
 * `not_configured`'da erken çıkış. Ayrı üç cron, aynı anahtarsızlık uyarısını üç kez basardı.
 *
 * ── NEDEN OLAY DEĞİL, TARAMA ────────────────────────────────────────────────
 * "Müşteri yazdı" olayını yakalayan bir kanca yok (webhook 15.7'nin işi) ve gerekmiyor: kuyruk
 * görünümleri "cevap bekleyen"i zaten türetiyor (`awaiting_reply`), tarama o kümeyi okuyor.
 * Önbellek kuralı (taslak son mesajdan tazeyse model çağrılmaz) çekirdekte — burada değil, çünkü
 * web'in "Taslak öner" düğmesi de aynı kuraldan geçmeli (`generateTicketDraft` künyesi).
 *
 * ── MALİYET FRENİ ───────────────────────────────────────────────────────────
 * Koşu başına en fazla `BATCH` model çağrısı; kaçan satır ertesi turda telafi olur
 * (`translate-user-text` ile aynı gerekçe). Tavan ÜÇ taramanın toplamıdır — özerk cevaplar önce:
 * müşteriye gidecek cevap, operatörün önüne konacak taslaktan acildir.
 */
const BATCH = 10;

/** Bir taramanın sonucu sayaçlara nasıl düşer — üç tarama aynı çeviriciyi kullanır. */
function tally(sonuc: Record<string, number>, outcome: SupportAiOutcome): void {
  if (outcome.status === 'replied') sonuc.replied! += 1;
  else if (outcome.status === 'handoff') sonuc.handedOff! += 1;
  else if (outcome.status === 'generated') sonuc.drafted! += 1;
  else if (outcome.status === 'failed') sonuc.failed! += 1;
  else sonuc.skipped! += 1;
}

export async function supportAiJob(): Promise<Record<string, unknown>> {
  const db: Db = serviceDb();
  const sonuc: Record<string, number> = { replied: 0, handedOff: 0, drafted: 0, failed: 0, skipped: 0 };
  let kalan = BATCH;

  const tickets = new TicketQueueService(db);
  const inbox = new ConversationInboxService(db);

  // 1) Özerk cevaplar — modu `ai`, son sözü müşteri söylemiş, kapanmamış talepler.
  const autonomous = await tickets.list({ handledBy: 'ai', awaitingReply: true, openOnly: true }, undefined, BATCH);
  for (const row of autonomous.rows) {
    if (kalan <= 0) break;
    kalan -= 1;
    const outcome = await runAutonomousTicketReply(db, row.id);
    if (outcome.status === 'failed') {
      // Anahtarsız kurulumda TUR biter, satır satır uyarı basılmaz (`translate-user-text` kuralı).
      if (outcome.reason === 'not_configured') {
        logger.warn({ job: SUPPORT_AI }, 'AI yapılandırılmamış — destek turu atlandı');
        return sonuc;
      }
      await captureError(new Error(`özerk cevap üretilemedi (${outcome.reason})`), {
        source: SOURCES.backendCron,
        context: { job: SUPPORT_AI, ticketId: row.id, reason: outcome.reason },
      });
    }
    tally(sonuc, outcome);
  }

  // 2) Hibrit talep taslakları. Önbellek çekirdekte: taze taslaklı satır `cached` döner ve tavandan
  //    yemez — yine de çağrı sayılır çünkü DB turu atıldı; tavan MODEL çağrısını değil turu frenler.
  const hybridTickets = await tickets.list({ handledBy: 'hybrid', awaitingReply: true, openOnly: true }, undefined, BATCH);
  for (const row of hybridTickets.rows) {
    if (kalan <= 0) break;
    // Taze taslaklı satırı DB turu atmadan ele: kuyruk satırı taslağı ve son mesaj anını zaten taşıyor.
    if (row.aiDraftReply && row.aiDraftGeneratedAt && row.aiDraftGeneratedAt >= row.lastMessageAt) {
      sonuc.skipped! += 1;
      continue;
    }
    kalan -= 1;
    const outcome = await generateTicketDraft(db, row.id);
    if (outcome.status === 'failed') {
      if (outcome.reason === 'not_configured') {
        logger.warn({ job: SUPPORT_AI }, 'AI yapılandırılmamış — destek turu atlandı');
        return sonuc;
      }
      await captureError(new Error(`talep taslağı üretilemedi (${outcome.reason})`), {
        source: SOURCES.backendCron,
        context: { job: SUPPORT_AI, ticketId: row.id, reason: outcome.reason },
      });
    }
    tally(sonuc, outcome);
  }

  // 3) Hibrit WhatsApp taslakları. Gelen kutusu görünümünde mod süzgeci yok (tek sayfa yeter);
  //    süzme burada — BATCH'lik ilk sayfada hibrit olmayanlar elenir.
  const conversations = await inbox.list({ awaitingReply: true }, undefined, BATCH);
  for (const row of conversations.rows.filter((r) => r.handledBy === 'hybrid')) {
    if (kalan <= 0) break;
    if (row.aiDraftReply && row.aiDraftGeneratedAt && row.lastMessageAt && row.aiDraftGeneratedAt >= row.lastMessageAt) {
      sonuc.skipped! += 1;
      continue;
    }
    kalan -= 1;
    const outcome = await generateConversationDraft(db, row.id);
    if (outcome.status === 'failed') {
      if (outcome.reason === 'not_configured') {
        logger.warn({ job: SUPPORT_AI }, 'AI yapılandırılmamış — destek turu atlandı');
        return sonuc;
      }
      await captureError(new Error(`konuşma taslağı üretilemedi (${outcome.reason})`), {
        source: SOURCES.backendCron,
        context: { job: SUPPORT_AI, conversationId: row.id, reason: outcome.reason },
      });
    }
    tally(sonuc, outcome);
  }

  return sonuc;
}
