import {
  generateConversationDraft,
  generateTicketDraft,
  messageSenderFor,
  runAutonomousConversationReply,
  runAutonomousTicketReply,
  type SupportAiOutcome,
} from '@lezzet/application';
import { ConversationInboxService, TicketQueueService, serviceDb, type Db } from '@lezzet/database';
import { captureError, logger, SOURCES } from '@lezzet/observability';

export const SUPPORT_AI = 'support_ai';

/**
 * **AI DESTEK TURU** (16.5 · 20.4 · 15.8) — dört tarama, tek iş:
 *
 *   1. Modu `ai` olan, cevap bekleyen talepler → ÖZERK cevap (ya da insana devir).
 *   2. Modu `ai` olan, cevap bekleyen SOHBETLER → ÖZERK cevap; **gönderim kapısından geçer** (15.8).
 *   3. Modu `hybrid` olan, cevap bekleyen talepler → TASLAK üretimi (`ai_draft_reply`).
 *   4. Modu `hybrid` olan, cevap bekleyen sohbetler → taslak üretimi.
 *
 * Dördü tek işte, çünkü frenleri ortak: koşu başına toplam çağrı tavanı (`BATCH`) ve
 * `not_configured`'da erken çıkış. Ayrı dört cron, aynı anahtarsızlık uyarısını dört kez basardı.
 *
 * ── SOHBET TARAMASI TALEPTEN FARKLI: GÖNDERİLEBİLİRLİK ──────────────────────
 * Talep cevabı deftere yazılır ve mutlaka "olur"; sohbet cevabı SAĞLAYICIYA gider ve pencere
 * kapalıysa gidemez. O yüzden sohbet motoru bir `MessageSender` alıyor ve jeton yoksa sürücü
 * `unconfiguredSender`dır — tur "gönderdim" demez, `failed` der (`messageSenderFor` künyesi).
 *
 * ── NEDEN OLAY DEĞİL, TARAMA ────────────────────────────────────────────────
 * "Müşteri yazdı" olayını yakalayan bir kanca yok (webhook 15.7'nin işi) ve gerekmiyor: kuyruk
 * görünümleri "cevap bekleyen"i zaten türetiyor (`awaiting_reply`), tarama o kümeyi okuyor.
 * Önbellek kuralı (taslak son mesajdan tazeyse model çağrılmaz) çekirdekte — burada değil, çünkü
 * web'in "Taslak öner" düğmesi de aynı kuraldan geçmeli (`generateTicketDraft` künyesi).
 *
 * ── MALİYET FRENİ ───────────────────────────────────────────────────────────
 * Koşu başına en fazla `BATCH` model çağrısı; kaçan satır ertesi turda telafi olur
 * (`translate-user-text` ile aynı gerekçe). Tavan DÖRT taramanın toplamıdır — özerk cevaplar önce:
 * müşteriye gidecek cevap, operatörün önüne konacak taslaktan acildir.
 */
const BATCH = 10;

/** Bir taramanın sonucu sayaçlara nasıl düşer — dört tarama aynı çeviriciyi kullanır. */
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

  /*
    2) Özerk SOHBET cevapları (15.8) — modu `ai`, son sözü müşteri söylemiş sohbetler.

    Gelen kutusu görünümünde mod süzgeci yok, süzme burada — ve sayfa BİR KEZ çekilip iki taramada
    (özerk + hibrit) kullanılıyor: aynı sayfayı iki kez istemek, aynı satırları iki kez okumak olurdu.

    Jeton `apps/backend`in env'inden okunur (paket env okumaz, `STACK §4`); yoksa sürücü reddeder ve
    motor modu DEĞİŞTİRMEZ — yapılandırma boşluğu yüzünden her sohbeti insana devretmek, geri
    alınması zor bir veri değişikliği olurdu (`runAutonomousConversationReply` künyesi).
  */
  const sender = messageSenderFor(process.env.META_ACCESS_TOKEN);
  const conversations = await inbox.list({ awaitingReply: true }, undefined, BATCH);
  for (const row of conversations.rows.filter((r) => r.handledBy === 'ai')) {
    if (kalan <= 0) break;
    kalan -= 1;
    const outcome = await runAutonomousConversationReply(db, sender, row.id);
    if (outcome.status === 'failed') {
      /* İki ayrı "yapılandırılmamış" var ve ikisi aynı tepkiyi hak etmiyor — tip de bunu söylüyor
         (`SupportAiOutcome` künyesi). GÖNDERİM jetonu yoksa yalnız bu tarama anlamsızdır: `break`,
         çünkü operatörün taslağı yine üretilmeli. AI ANAHTARI yoksa tüm tur anlamsızdır: `return`,
         çünkü sonraki üç tarama da model çağıracak ve aynı uyarıyı üç kez basacaktı. */
      if (outcome.reason === 'send_not_configured') {
        logger.warn({ job: SUPPORT_AI }, 'gönderim yapılandırılmamış — özerk sohbet taraması atlandı');
        break;
      }
      if (outcome.reason === 'not_configured') {
        logger.warn({ job: SUPPORT_AI }, 'AI yapılandırılmamış — destek turu atlandı');
        return sonuc;
      }
      await captureError(new Error(`özerk sohbet cevabı gönderilemedi (${outcome.reason})`), {
        source: SOURCES.backendCron,
        context: { job: SUPPORT_AI, conversationId: row.id, reason: outcome.reason },
      });
    }
    tally(sonuc, outcome);
  }

  // 3) Hibrit talep taslakları. Önbellek çekirdekte: taze taslaklı satır `cached` döner ve tavandan
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

  // 4) Hibrit sohbet taslakları — sayfa yukarıda çekildi (2. tarama), burada yalnız süzgeç değişir.
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
