import { Hono } from 'hono';
import { z } from 'zod';
import { generateConversationDraft, recordOutboundMessage, ringConversationsBell } from '@lezzet/application';
import { ConversationInboxService, ConversationService, MessageService, serviceDb } from '@lezzet/database';
import {
  ConversationSourceEnum,
  DEFAULT_PAGE_SIZE,
  SocialConversationDetailSchema,
  SocialDraftConsumeResponseSchema,
  SocialDraftResponseSchema,
  SocialInboxResponseSchema,
  SocialModeRequestSchema,
  SocialModeResponseSchema,
  SocialReplyRequestSchema,
  type ConversationInboxRow,
  type KeysetCursor,
  type Message,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, readJsonBody, UuidSchema } from '../../lib/request';
import { requireStaffRole, type StaffEnv } from './auth';

/*
  `/social` (15.15'in mobil ayağı · 21.08) — operasyonun "Sosyal Mesajlar" gelen kutusu: üç Meta
  kanalı (WhatsApp · Messenger · Instagram DM) tek kuyrukta, web `/operations/social` ekranının
  birebir aynası.

  KURAL BURADA DEĞİL: defter yazımı ve israf nöbeti `@lezzet/application`ın mesaj kapılarında
  (`messaging/record.ts` — web action'larıyla TEK kural), taslak üretimi AI çekirdeğinde
  (`generateConversationDraft` — web "Taslak öner" düğmesiyle aynı kapı), satır okuma
  `ConversationInboxService`/`MessageService`te. Bu dosya TAŞIMA katmanıdır: sorguyu süzer,
  sözleşme şekline indirger, zarflar.

  ── YALNIZ `admin` (web `requireAdmin`ın aynası) ─────────────────────────────
  Web yüzeyi bu ekranı yalnız yöneticiye açıyor (`social/actions.ts` künyesi: "düğmeyi çizmemek
  bir güvence değildir"); mobil kapı aynı kararı `requireStaffRole('admin')` ile verir. Kurye/depo
  rolleri müşteri yazışmalarını görmez — yazışma içeriği kişisel veridir, rol kapısı en dar çevrede.

  ── BURADAN MESAJ GÖNDERİLMEZ (defter evresi) ───────────────────────────────
  Web ile aynı gerçek: gönderim kanalı henüz yok (Graph API sürücüsü 15.11). Cevap ucu DEFTER
  tutar — operatör metni telefonundan/Business Suite'ten gönderir, gönderdiğini buraya işler.
  Canlı kanal açıldığında gönderen kapı da `@lezzet/application`da kurulacak ve iki yüzey yine
  aynı kapıyı çağıracak.
*/

/** Sayfa tavanı — talep/sipariş uçlarının aynı kararı: tek istekle arşivi boşaltmak sayfalamayı anlamsız kılar. */
const MAX_PAGE_SIZE = 50;

/**
 * Kuyruk sorgusu — web `social-url`un aynası: süzgeç `all | awaiting` + kanal. `awaiting` bir
 * boolean DEĞİL enum: `z.coerce.boolean()` "false" dizesini `true` yapar (her dolu dize truthy) —
 * telde iki değerli bir dize, yanlış anlaşılamayan tek şekil.
 */
const InboxQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  filter: z.enum(['all', 'awaiting']).default('all'),
  source: ConversationSourceEnum.optional(),
});

/** Sohbet geçmişi sorgusu — yalnız imleç + tavan (yeniden eskiye, `listRecent`). */
const DetailQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * AI üretim retleri → HTTP durumu. `not_found` dışındakiler 409: istek doğruydu, konuşmanın ŞU
 * ANKİ hâli üretime izin vermiyor (mod yanlış / cevaplanacak mesaj yok / sağlayıcı yok) — ekran
 * anahtarı kendi sözlüğünden cümleye çevirir (web `DRAFT_FAILURE` sözlüğünün mobil karşılığı).
 */
function draftFailStatus(reason: string): 404 | 409 {
  return reason === 'not_found' ? 404 : 409;
}

export const social = new Hono<StaffEnv>();
social.use('*', requireStaffRole('admin'));

/** Detay gövdesi tek yerde kurulur: GET ve cevap ucu AYNI şekli döndürmek zorunda (tickets `toDetailBody` deseni). */
function toDetailBody(
  row: ConversationInboxRow,
  messages: Message[],
  nextCursor: KeysetCursor | null,
): z.input<typeof SocialConversationDetailSchema> {
  // `parse` süzgeçtir (MeSchema kararı): pick'te olmayan alan (optIn, providerAccountRef) zarfa sızamaz.
  return {
    conversation: row,
    messages,
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
  };
}

/**
 * Kuyruk — son harekete göre sıralı, keyset sayfalı; başlık sayaçları AYNI turda (sözleşme
 * künyesindeki gerekçe). Üç okuma paralel: birbirine bakmıyorlar, sırayla beklemek gecikmeyi
 * üçe katlardı (warehouse hub deseni).
 */
social.get('/conversations', async (c) => {
  const parsed = InboxQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const { cursor, limit, filter, source } = parsed.data;

  const db = serviceDb();
  const inbox = new ConversationInboxService(db);
  const [page, awaitingReply, handledByAi] = await Promise.all([
    inbox.list({ awaitingReply: filter === 'awaiting' ? true : undefined, source }, decodeCursor(cursor), limit),
    inbox.countAwaitingReply(source),
    new ConversationService(db).countHandledByAi(source),
  ]);

  const body: z.input<typeof SocialInboxResponseSchema> = {
    rows: page.rows,
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    counts: { awaitingReply, handledByAi },
  };
  return ok(c, SocialInboxResponseSchema.parse(body));
});

/**
 * Sohbet — künye + mesajların sayfası (YENİDEN ESKİYE; sıra ters çevirme ekranın işi). Devam
 * sayfası da aynı uçtan (`cursor`): künye her cevapta gelir, ekran ilk sayfadan sonra yok sayar.
 *
 * Künye `conversation` tablosundan değil GÖRÜNÜMDEN okunur: müşteri adı ve son mesaj alanları
 * orada türetilmiş duruyor — tabloyu okuyup adı ikinci sorguyla çekmek, görünümün var olma
 * sebebini yok saymak olurdu.
 */
social.get('/conversations/:id', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const query = DetailQuerySchema.safeParse(c.req.query());
  if (!query.success) return fail(c, 'invalid_query', 400);

  const db = serviceDb();
  const [row, messagePage] = await Promise.all([
    new ConversationInboxService(db).getById(id.data),
    new MessageService(db).listRecent(id.data, decodeCursor(query.data.cursor), query.data.limit),
  ]);
  if (!row) return fail(c, 'conversation_not_found', 404);

  return ok(c, SocialConversationDetailSchema.parse(toDetailBody(row, messagePage.rows, messagePage.nextCursor)));
});

/**
 * Cevabı deftere işle — pencereye dokunmaz (giden mesaj pencere açmaz). Cevap GÜNCEL DETAYI
 * döndürür (tickets ucunun kararı): yazım son mesajı ve `awaitingReply`ı da oynatıyor, tek kaydı
 * dönmek ekranı kendi durumunu tahmin etmeye zorlardı.
 *
 * Zil çalınır (`ringConversationsBell`): web gelen kutusu açıksa mobilden işlenen cevabı
 * kendiliğinden görür — webhook'un aynı kararı; zil düşerse kayıt düşmez (zil hatayı kendi yutar).
 */
social.post('/conversations/:id/reply', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const body = SocialReplyRequestSchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const inbox = new ConversationInboxService(db);
  const existing = await inbox.getById(id.data);
  if (!existing) return fail(c, 'conversation_not_found', 404);

  await recordOutboundMessage(db, { conversationId: id.data, text: body.data.text });
  await ringConversationsBell();

  const [row, messagePage] = await Promise.all([
    inbox.getById(id.data),
    new MessageService(db).listRecent(id.data, undefined, DEFAULT_PAGE_SIZE),
  ]);
  if (!row) return fail(c, 'conversation_not_found', 404);
  return ok(c, SocialConversationDetailSchema.parse(toDetailBody(row, messagePage.rows, messagePage.nextCursor)));
});

/**
 * Yürütücü modu (human · hybrid · ai) — web `setConversationModeAction`ın aynası: hedef enum'dan
 * doğrulanır; aynı moda ikinci çağrı bir YARIŞIN işaretidir ve görünür retle döner (`409
 * mode_unchanged`) — sessizce "oldu" demek, öteki operatörün değişikliğini yutmak olurdu.
 */
social.post('/conversations/:id/mode', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const body = SocialModeRequestSchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const service = new ConversationService(serviceDb());
  const conversation = await service.getById(id.data);
  if (!conversation) return fail(c, 'conversation_not_found', 404);
  if (conversation.handledBy === body.data.mode) return fail(c, 'mode_unchanged', 409);

  const updated = await service.setMode(id.data, body.data.mode);
  return ok(c, SocialModeResponseSchema.parse({ mode: updated.handledBy }));
});

/**
 * Taslak öner — hibrit konuşmada AI taslağını istek üzerine üretir, cron beklenmez (web 20.4
 * düğmesiyle AYNI kapı). Metin dönmez: taslak satıra yazılır, ekran detayı yeniden okur —
 * iki yol iki farklı metin gösteremesin diye tek okuma kaynağı satırdır.
 */
social.post('/conversations/:id/draft', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const outcome = await generateConversationDraft(serviceDb(), id.data, { force: true });
  if (outcome.status === 'skipped' || outcome.status === 'failed') {
    return fail(c, outcome.reason, draftFailStatus(outcome.reason));
  }
  return ok(c, SocialDraftResponseSchema.parse({ generated: true }));
});

/**
 * Taslağı tüket — metin SUNUCUDAN döner (yarış: başka operatör az önce tüketmiş olabilir,
 * ekrandaki kopya bayat olabilir). "Gönderildi" DEMEZ: dönen metni ekran cevap kutusuna taşır,
 * operatör gönderir ve gönderdiğini `reply` ile deftere işler (web'in aynı iki adımı).
 */
social.post('/conversations/:id/draft/consume', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const service = new ConversationService(serviceDb());
  const conversation = await service.getById(id.data);
  if (!conversation) return fail(c, 'conversation_not_found', 404);
  if (!conversation.aiDraftReply) return fail(c, 'no_draft', 409);

  await service.clearDraft(id.data);
  return ok(c, SocialDraftConsumeResponseSchema.parse({ draft: conversation.aiDraftReply }));
});
