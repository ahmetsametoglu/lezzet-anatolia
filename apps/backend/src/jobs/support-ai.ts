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

/*
  ── DÜŞEN SATIRIN FRENİ (06.09) ─────────────────────────────────────────────
  Tur sıklığı 5 dakikadan 1 dakikaya çekilirken açılan tek gerçek risk buydu ve kapatılması
  sıklıktan önce gelir.

  Arıza şöyle: özerk cevap SAĞLAYICI hatasıyla düşerse (`failed`) mod değişmiyor ve giden mesaj
  yazılmıyor — bilerek, çünkü yapılandırma boşluğu yüzünden sohbeti insana devretmek geri alınması
  zor bir veri değişikliğidir (`runAutonomousConversationReply` künyesi). Ama satır bu yüzden
  `awaiting_reply` kalıyor ve HER turda model yeniden çağrılıyor. Beş dakikada saatte 12 çağrı,
  bir dakikada 60 — hem de hiçbiri müşteriye ulaşmayacak.

  Fren üstel: 1 → 2 → 4 → 8 … dakika, yarım saatte tavan. Başarıda iz siliniyor, yani geçici bir
  sağlayıcı kesintisi kendini onarıyor ve kalıcı arıza sessizce para yakmıyor.

  **Bellekte tutuluyor, veritabanında değil** ve bu bilinçli: backend tek instance (`STACK §13`),
  fren bir dayanıklılık kaydı değil bir maliyet siperi. Yeniden başlatma izi siler — en kötü
  ihtimalle bir kez fazladan denenir, o da doğru davranış.
*/
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;
/** Kayıt bu süre boyunca hiç görülmediyse düşer — kuyruktan çıkmış satırlar haritayı şişirmesin. */
const BACKOFF_TTL_MS = 6 * 60 * 60_000;

const backoff = new Map<string, { fails: number; nextAt: number; seenAt: number }>();

function shouldBackOff(id: string, now: number): boolean {
  const kayit = backoff.get(id);
  return kayit !== undefined && now < kayit.nextAt;
}

function noteFailure(id: string, now: number): void {
  const fails = (backoff.get(id)?.fails ?? 0) + 1;
  const bekleme = Math.min(BACKOFF_BASE_MS * 2 ** (fails - 1), BACKOFF_MAX_MS);
  backoff.set(id, { fails, nextAt: now + bekleme, seenAt: now });
}

/** Başarı izi siler: geçici kesinti kendini onarır, bir sonraki mesaj hemen cevaplanır. */
function noteSuccess(id: string): void {
  backoff.delete(id);
}

/** Tur başında budama — kuyruktan çıkmış satırların kaydı sonsuza kadar durmasın. */
function pruneBackoff(now: number): void {
  for (const [id, kayit] of backoff) if (now - kayit.seenAt > BACKOFF_TTL_MS) backoff.delete(id);
}

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
  const now = Date.now();
  pruneBackoff(now);

  const autonomous = await tickets.list({ handledBy: 'ai', awaitingReply: true, openOnly: true }, undefined, BATCH);
  for (const row of autonomous.rows) {
    if (kalan <= 0) break;
    // Fren SAYAÇ TÜKETMEDEN atlar: düşen bir satır turun tavanını yiyip sağlıklı satırları
    // sıraya bırakamamalı — arızanın bedeli kendi dışına taşmasın.
    if (shouldBackOff(`ticket:${row.id}`, now)) {
      sonuc.skipped! += 1;
      continue;
    }
    kalan -= 1;
    const outcome = await runAutonomousTicketReply(db, row.id);
    if (outcome.status === 'failed') noteFailure(`ticket:${row.id}`, now);
    else noteSuccess(`ticket:${row.id}`);
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
    if (shouldBackOff(`conversation:${row.id}`, now)) {
      sonuc.skipped! += 1;
      continue;
    }
    kalan -= 1;
    const outcome = await runAutonomousConversationReply(db, sender, row.id);
    if (outcome.status === 'failed') noteFailure(`conversation:${row.id}`, now);
    else noteSuccess(`conversation:${row.id}`);
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
