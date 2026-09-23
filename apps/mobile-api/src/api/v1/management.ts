import { Hono, type Context } from 'hono';
/* Gövde şemaları sözleşmeden gelir; sorgu dizesi ucun kendi kabuğudur ve burada kurulur. */
import { z } from 'zod';
import {
  askShortfall,
  changeTicketStatus,
  consumeTicketDraft,
  createSupplyDraft,
  listOfferCandidates,
  listOrderExceptions,
  listSupplyGroups,
  notifyB2bDecision,
  openBatchOffer,
  readComplaint,
  readComplaintQueue,
  readB2bCheck,
  readB2bQueue,
  readB2bSummary,
  readManagementHub,
  replyAsStaff,
  setTicketMode,
  setTicketType,
  triggerReturnFromTicket,
  type ComplaintQueueFilter,
} from '@lezzet/application';
import { UserProfileService, WarehouseService, serviceDb } from '@lezzet/database';
import { b2bStatusOf } from '@lezzet/domain-core';
import { logger } from '@lezzet/observability';
import {
  B2bCheckResponseSchema,
  B2bSummaryResponseSchema,
  B2bDecisionResponseSchema,
  B2bQueueQuerySchema,
  B2bQueueResponseSchema,
  B2bRejectRequestSchema,
  ComplaintDraftRequestSchema,
  ComplaintDraftResponseSchema,
  ComplaintModeRequestSchema,
  ComplaintReplyRequestSchema,
  ComplaintResponseSchema,
  ComplaintsResponseSchema,
  ComplaintStatusRequestSchema,
  ComplaintTypeRequestSchema,
  ExceptionAskResponseSchema,
  ExceptionsResponseSchema,
  ManagementHubSchema,
  OfferCandidatesResponseSchema,
  OfferOpenRequestSchema,
  OfferOpenResponseSchema,
  SupplyDraftRequestSchema,
  SupplyDraftResponseSchema,
  SupplyResponseSchema,
  TicketActionResponseSchema,
  TicketTypeEnum,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, readJsonBody, UuidSchema } from '../../lib/request';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * Yönetim bölümü uçları: parse → kapı → zarf, kural hesaplanmaz. Kapı yalnız `admin`, depo süzgeci yok (yönetim işletmenin
 * tamamına bakar) ve hub ile gün özeti aynı zarfı okur — ayrı uç iki ekranın sayılarını iki ayrı ana düşürürdü.
 */
export const management = new Hono<StaffEnv>();

management.use('*', requireStaffRole('admin'));

management.get('/hub', async (c) => {
  const hub = await readManagementHub(serviceDb());
  return ok(c, ManagementHubSchema.parse(hub satisfies z.input<typeof ManagementHubSchema>));
});

/** Yönetim okumalarının kapsamı: aktif TESİSLER — hub motoruyla aynı küme, iki yerde ayrışmasın. */
async function activeFacilityIds(): Promise<string[]> {
  const warehouses = await new WarehouseService(serviceDb()).list({ activeOnly: true, kind: 'facility' });
  return warehouses.map((warehouse) => warehouse.id);
}

/* ── Y3 · Yakın-SKT teklif onayı ────────────────────────────────────────────── */

management.get('/offer-candidates', async (c) => {
  const candidates = await listOfferCandidates(serviceDb(), { warehouseIds: await activeFacilityIds() });
  return ok(
    c,
    OfferCandidatesResponseSchema.parse({ candidates } satisfies z.input<typeof OfferCandidatesResponseSchema>),
  );
});

management.post('/offers', async (c) => {
  const parsed = OfferOpenRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  // Partiler SIRALI açılır, yarıştırılmaz: hepsi aynı ayar satırını okur ve toplu istek küçük
  // (şema tavanı 50). Biri reddedilse kalanlar yine denenir — akıbet satır satır gövdede.
  const results = [];
  for (const item of parsed.data.items) {
    const outcome = await openBatchOffer(serviceDb(), {
      stockId: item.stockId,
      offerPriceCents: item.offerPriceCents,
    });
    results.push({ stockId: item.stockId, status: outcome.status });
  }
  return ok(c, OfferOpenResponseSchema.parse({ results } satisfies z.input<typeof OfferOpenResponseSchema>));
});

/* ── Y4 · Tedarik önerisi ───────────────────────────────────────────────────── */

management.get('/supply', async (c) => {
  const groups = await listSupplyGroups(serviceDb(), { warehouseIds: await activeFacilityIds() });
  return ok(c, SupplyResponseSchema.parse({ groups } satisfies z.input<typeof SupplyResponseSchema>));
});

management.post('/supply/draft', async (c) => {
  const parsed = SupplyDraftRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const outcome = await createSupplyDraft(serviceDb(), parsed.data);
  return ok(c, SupplyDraftResponseSchema.parse(outcome satisfies z.input<typeof SupplyDraftResponseSchema>));
});

/* ── Y1 · Şikâyet / talep detayı ────────────────────────────────────────────── */

/** Sayfa tavanı — sosyal ve sipariş uçlarının aynı kararı: tek istekle arşivi boşaltmak sayfalamayı anlamsız kılar. */
const COMPLAINTS_MAX_PAGE_SIZE = 50;

/**
 * Süzgeç ile tür telde ayrı iki alan, çünkü farklı sorular: `filter` kuyruğun hâlini, `type` sınıfını daraltır. Tek enum'a
 * gömülseydi "bozuk ve top bizde" gibi meşru bir daralma sorulamazdı.
 */
const ComplaintsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(COMPLAINTS_MAX_PAGE_SIZE).default(20),
  filter: z.enum(['all', 'awaiting', 'resolved']).default('all'),
  type: TicketTypeEnum.optional(),
});

/**
 * Talep listesi kuyruk sayfasını ve şerit sayaçlarını tek turda verir; satır `TicketQueueItem`dan daraltılır, çünkü `parse` bir
 * süzgeçtir ve sözleşmede olmayan alan zarfa sızmaz.
 */
management.get('/complaints', async (c) => {
  const parsed = ComplaintsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const { cursor, limit, filter, type } = parsed.data;

  /* Tür daha dar bir sorudur; ikisi birden gelirse tür kazanır. Ekran ikisini birden göndermiyor, uç yine de belirli davranır. */
  const queueFilter: ComplaintQueueFilter = type ? { kind: 'type', type } : { kind: filter };
  const { rows, nextCursor, counts } = await readComplaintQueue(serviceDb(), queueFilter, decodeCursor(cursor), limit);

  const body: z.input<typeof ComplaintsResponseSchema> = {
    rows: rows.map((row) => ({
      ticketId: row.id,
      type: row.type,
      status: row.status,
      customerName: row.customerName,
      preview: row.preview,
      previewTranslated: row.previewTranslated,
      previewLanguage: row.previewLanguage,
      lastMessageAt: row.lastMessageAt,
      awaitingReply: row.awaitingReply,
      hasAttachment: row.hasAttachment,
      orderReferenceNo: row.orderReferenceNo,
      /* Satır elle kurulduğu için alan burada da yazılmak zorunda: unutulsaydı `parse` bütün listeyi 500'e düşürürdü. */
      windowExpiresAt: row.windowExpiresAt,
    })),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    counts,
  };
  return ok(c, ComplaintsResponseSchema.parse(body));
});

management.get('/complaints/next', async (c) => {
  const complaint = await readComplaint(serviceDb(), { next: true });
  return ok(c, ComplaintResponseSchema.parse({ complaint } satisfies z.input<typeof ComplaintResponseSchema>));
});

management.get('/complaints/:id', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const complaint = await readComplaint(serviceDb(), { ticketId: id.data });
  return ok(c, ComplaintResponseSchema.parse({ complaint } satisfies z.input<typeof ComplaintResponseSchema>));
});

management.post('/complaints/:id/reply', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = ComplaintReplyRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await replyAsStaff(serviceDb(), {
    ticketId: id.data,
    authorId: c.get('staff').id,
    body: parsed.data.body,
  });
  return ok(
    c,
    TicketActionResponseSchema.parse({
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    } satisfies z.input<typeof TicketActionResponseSchema>),
  );
});

/**
 * Talebin durumunu değiştirir; hedef çağırandan gelir, çünkü aksiyon çekmecesi üç geçişi birden istiyor (üstlen · çöz · yeniden aç).
 * İzni motor verir: geçersiz geçiş HTTP hatasıyla değil sebeple döner ve ekran sebebi cümleye çevirir.
 */
management.post('/complaints/:id/status', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = ComplaintStatusRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await changeTicketStatus(serviceDb(), { ticketId: id.data, to: parsed.data.to, by: 'staff' });
  return ok(
    c,
    TicketActionResponseSchema.parse({
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    } satisfies z.input<typeof TicketActionResponseSchema>),
  );
});

/** Yürütücü modu (çekmecenin "ASİSTAN MODU" bölümü) — aynı moda geçiş `already_in_mode` ile reddedilir. */
management.post('/complaints/:id/mode', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = ComplaintModeRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await setTicketMode(serviceDb(), { ticketId: id.data, mode: parsed.data.mode });
  return ok(
    c,
    TicketActionResponseSchema.parse({
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    } satisfies z.input<typeof TicketActionResponseSchema>),
  );
});

/** Talep türünün düzeltilmesi (çekmecenin "TALEP TÜRÜ" bölümü) — geçiş kuralı yok, sınıflandırma. */
management.post('/complaints/:id/type', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = ComplaintTypeRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await setTicketType(serviceDb(), { ticketId: id.data, type: parsed.data.type });
  return ok(
    c,
    TicketActionResponseSchema.parse({
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    } satisfies z.input<typeof TicketActionResponseSchema>),
  );
});

/**
 * İade akışını bu talepten başlatır — yalnız damga, gövdesiz. Tutar ve akıbet burada seçilmez; iade siparişte yaşıyor.
 */
management.post('/complaints/:id/return', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const result = await triggerReturnFromTicket(serviceDb(), id.data);
  return ok(
    c,
    TicketActionResponseSchema.parse({
      ok: result.ok,
      reason: result.ok ? null : result.reason,
    } satisfies z.input<typeof TicketActionResponseSchema>),
  );
});

management.post('/complaints/:id/draft', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = ComplaintDraftRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const result = await consumeTicketDraft(serviceDb(), {
    ticketId: id.data,
    authorId: c.get('staff').id,
    send: parsed.data.send,
  });
  return ok(
    c,
    ComplaintDraftResponseSchema.parse({
      ok: result.ok,
      reason: result.ok ? null : result.reason,
      draft: result.ok ? result.data.draft : null,
    } satisfies z.input<typeof ComplaintDraftResponseSchema>),
  );
});

/* ── Y2 · Sipariş istisnaları (eksik toplama) ───────────────────────────────── */

management.get('/exceptions', async (c) => {
  const exceptions = await listOrderExceptions(serviceDb(), { warehouseIds: await activeFacilityIds() });
  return ok(c, ExceptionsResponseSchema.parse({ exceptions } satisfies z.input<typeof ExceptionsResponseSchema>));
});

management.post('/exceptions/:orderItemId/ask', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('orderItemId'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const outcome = await askShortfall(serviceDb(), { orderItemId: id.data, authorId: c.get('staff').id });
  return ok(
    c,
    ExceptionAskResponseSchema.parse({
      status: outcome.status,
      ticketId: 'ticketId' in outcome ? outcome.ticketId : null,
    } satisfies z.input<typeof ExceptionAskResponseSchema>),
  );
});

/*
  ── KURUMSAL HESAP BAŞVURUSU (21.217) ───────────────────────────────────────

  Bildirim (`b2b_application_received`) telefona düşüyordu ama açılmıyordu: hedefi olmayan türler
  için ayrılmış bekleme tablosunda duruyordu. Bu dört uç o hedefi doğuruyor.

  **KARAR VERİSİ TEK KAYNAKTAN.** Kart da kuyruk da `readB2bCheck`ten besleniyor — web'in müşteri
  panelindeki diyalogla AYNI okuma (07.09'da paylaşılan pakete terfi etti). İki yüzey aynı başvuru
  için farklı bir şey söylerse operatör hangisine inanacağını bilemez.

  **KURAL BURADA DEĞİL:** sinyallerin tonu ve bayrak `domain-core/b2b-approval` motorundan, onay/ret
  yazımı `UserProfileService`ten. Bu dosya taşıma katmanıdır.
*/

/** Kuyruk — iki sekme (`pending` · `decided`), sayaçları ikisi için birden. */
management.get('/b2b', async (c) => {
  const parsed = B2bQueueQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const { filter, cursor, limit } = parsed.data;

  const view = await readB2bQueue(serviceDb(), {
    decided: filter === 'decided',
    cursor: decodeCursor(cursor),
    limit,
  });

  const body: z.input<typeof B2bQueueResponseSchema> = {
    rows: view.rows,
    nextCursor: view.nextCursor ? encodeCursor(view.nextCursor) : null,
    counts: view.counts,
    single: view.single,
  };
  return ok(c, B2bQueueResponseSchema.parse(body));
});

/** Kontrol kartı. İLK okuma dış servisleri TAZELER — künyesi `b2b/check.ts`te: ölçü yüzeye değil
    okumanın sırasına bağlı ve kartın açılışı o ilk andır (operatör bugünkü kaydı görmeli). */
management.get('/b2b/:id', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const check = await readB2bCheck(serviceDb(), id.data);
  const body: z.input<typeof B2bCheckResponseSchema> = { check };
  return ok(c, B2bCheckResponseSchema.parse(body));
});

/**
 * Asistan özeti karttan ayrı uçtur, çünkü model çağrısı saniye mertebesinde ve kartın açılışı onu beklememeli. Üretilememek 200
 * döner: anahtar yapılandırılmamış da olabilir sağlayıcı düşmüş de, ikisini 5xx yapmak kartı da götürürdü.
 */
management.get('/b2b/:id/summary', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const result = await readB2bSummary(serviceDb(), id.data);
  // `null` = müşteri yok; "özet yok" ile aynı cevaba indirilmiyor (künye `b2b/summary.ts`).
  if (result === null) return fail(c, 'not_found', 404);

  if (!result.ok) {
    logger.warn({ customerId: id.data, reason: result.reason }, 'b2b özeti üretilemedi');
    const bos: z.input<typeof B2bSummaryResponseSchema> = { summary: null };
    return ok(c, B2bSummaryResponseSchema.parse(bos));
  }

  const body: z.input<typeof B2bSummaryResponseSchema> = { summary: result.summary };
  return ok(c, B2bSummaryResponseSchema.parse(body));
});

/**
 * Onay tek dokunuştur, sebep istemez; sonucu müşterinin toptan fiyatları görmesi. `already_decided` hata değil cevaptır: aynı
 * başvuru iki telefondan açılabilir ve ikinci dokunuş hiçbir şeyi ikilemez.
 */
management.post('/b2b/:id/approve', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  return decide(c, id.data, true, (profiles) => profiles.approveB2b(id.data));
});

/** RET — sebep ZORUNLU. Ret SİLMEZ: kayıt B2C olarak yaşar ve aday künyesini düzeltip yeniden
    başvurabilir (o gün hâl `pending`e döner, ret kaydı geçmiş olarak kalır). */
management.post('/b2b/:id/reject', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);
  const parsed = B2bRejectRequestSchema.safeParse(await readJsonBody(c));
  if (!parsed.success) return fail(c, 'invalid_body', 400);

  const actorId = c.get('staff').id;
  return decide(c, id.data, false, (profiles) => profiles.rejectB2b(id.data, { actorId, reason: parsed.data.reason }));
});

/**
 * İki kararın ortak gövdesi: okuma, bayatlık kapısı, yazım, haber, cevap. Kapı yazımdan öncedir, çünkü reddedilmiş bir kaydı
 * ikinci kez reddetmek `b2b_rejected_at`i ileri taşır ve "ne zaman reddedildi" cevabını bozar.
 */
async function decide(
  c: Context<StaffEnv>,
  customerId: string,
  onay: boolean,
  yaz: (profiles: UserProfileService) => Promise<unknown>,
) {
  const profiles = new UserProfileService(serviceDb());
  const profile = await profiles.getById(customerId);
  if (!profile) return ok(c, B2bDecisionResponseSchema.parse({ result: 'not_found', status: null }));

  const status = b2bStatusOf(profile);
  if (status !== 'pending') {
    return ok(c, B2bDecisionResponseSchema.parse({ result: 'already_decided', status }));
  }

  await yaz(profiles);
  // Sonuç başvurana gider; beklenmez, çünkü mail gitmedi diye yazılmış karar geri alınmaz.
  void notifyB2bDecision(serviceDb(), customerId, onay);
  const sonra = await profiles.getById(customerId);
  const body: z.input<typeof B2bDecisionResponseSchema> = {
    result: 'ok',
    status: sonra ? b2bStatusOf(sonra) : null,
  };
  return ok(c, B2bDecisionResponseSchema.parse(body));
}
