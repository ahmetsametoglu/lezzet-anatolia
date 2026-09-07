import { Hono } from 'hono';
/* `z` artık DEĞER olarak da kullanılıyor: liste ucunun sorgu şeması burada kuruluyor (21.281) —
   gövde şemaları sözleşmeden gelir ama sorgu dizesi UCUN kendi kabuğudur, sözleşmenin değil. */
import { z } from 'zod';
import {
  askShortfall,
  changeTicketStatus,
  consumeTicketDraft,
  createSupplyDraft,
  listOfferCandidates,
  listOrderExceptions,
  listSupplyGroups,
  openBatchOffer,
  readComplaint,
  readComplaintQueue,
  readManagementHub,
  replyAsStaff,
  setTicketMode,
  setTicketType,
  triggerReturnFromTicket,
  type ComplaintQueueFilter,
} from '@lezzet/application';
import { WarehouseService, serviceDb } from '@lezzet/database';
import {
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
 * **YÖNETİM BÖLÜMÜ UÇLARI** (21.12) — hub'ın karar kutusu + Y5 gün özeti.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * parse → kapı → zarf. Karar kutusunun sayıları ve günün toplamları `readManagementHub`ta
 * birleşir; eksik toplama önerisi hazırlık motorunun, teklif adayı raf ömrü motorunun,
 * tedarik önerisi eşik servisinin sözüdür — uç yalnız taşır.
 *
 * ── KAPI YALNIZ `admin` ─────────────────────────────────────────────────────
 * Doc 04 rol tablosu: karar kutusu (Y1–Y6) yönetim bölümünündür. Depo süzgeci YOK ve bu bilinçli:
 * yönetim işletmenin tamamına bakar (`OrderListFilters` künyesi — depo-üstü okuma yalnız
 * admin/muhasebe için meşru); depo bazlı motorlar hub okumasının içinde tesis tesis sorulur.
 *
 * ── TEK UÇ, İKİ EKRAN ───────────────────────────────────────────────────────
 * Hub ve gün özeti ekranı aynı zarfı okur: özet ekranı hub'daki başlık şeridinin AÇILMIŞ hâlidir,
 * ayrı bir uç iki ekranın sayılarını iki ayrı ana düşürürdü ("kutu 3 diyor, özet 2" çelişkisi).
 */
export const management = new Hono<StaffEnv>();

management.use('*', requireStaffRole('admin'));

management.get('/hub', async (c) => {
  const hub = await readManagementHub(serviceDb());
  return ok(c, ManagementHubSchema.parse(hub satisfies z.input<typeof ManagementHubSchema>));
});

/** Yönetim okumalarının kapsamı: aktif TESİSLER — hub motoruyla aynı küme, iki yerde ayrışmasın. */
async function activeFacilityIds(): Promise<string[]> {
  // Süzgeç servise geçti (02.09) — aynı cümlenin üçüncü elle yazılmış kopyasıydı.
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
 * Kuyruk sorgusu (21.281). Süzgeç ile tür AYRI iki alan ama ekranda tek şerit: çipler birbirini
 * dışlıyor (v3:29'da tam bir çip koyu). Telde ayrı tutuluyor çünkü ikisi farklı sorular —
 * `filter` kuyruğun HÂLİNİ (`awaiting`/`resolved`), `type` SINIFINI daraltır; tek bir enum'a
 * gömülseydi "bozuk VE top bizde" gibi meşru bir daralma bir daha hiç sorulamazdı.
 */
const ComplaintsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(COMPLAINTS_MAX_PAGE_SIZE).default(20),
  filter: z.enum(['all', 'awaiting', 'resolved']).default('all'),
  type: TicketTypeEnum.optional(),
});

/**
 * Y1 · TALEP LİSTESİ — kuyruk sayfası + şerit sayaçları tek turda.
 *
 * Ekranın satırı `TicketQueueItem`dan daraltılıyor: kuyruk satırı `handledBy`, `answeredByAi`,
 * `source`, `returnBound` gibi TARAMANIN sormadığı alanlar da taşıyor ve `parse` bir SÜZGEÇTİR
 * (`MeSchema` kararı) — sözleşmede olmayan alan zarfa sızmaz.
 */
management.get('/complaints', async (c) => {
  const parsed = ComplaintsQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);
  const { cursor, limit, filter, type } = parsed.data;

  /* Tür seçiliyse şeridin hâl çipi zaten koyu değildir — tür DAHA DAR bir sorudur ve ikisi
     çakışırsa tür kazanır. Ekran zaten ikisini birden göndermiyor; uç yine de belirli davranır. */
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
 * Talebin durumunu değiştir — **`/claim`in yerine geçti** (21.276).
 *
 * Eski uç hedefi kendi içinde `in_progress` diye sabitliyordu; aksiyon çekmecesi üç geçişi birden
 * istiyor (üstlen · çöz · yeniden aç). İkinci bir uç açmak aynı motor çağrısına iki kapı açmak
 * olurdu — niyet artık çağıranın, uç yalnız hedefi taşıyor.
 *
 * İZNİ MOTOR VERİYOR (`canTransitionTicket`, `changeTicketStatus`in içinde): geçersiz geçiş
 * `ok:false` + sebeple döner, HTTP hatasıyla değil — ekran sebebi cümleye çevirir.
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
 * İade akışını bu talepten başlat — **yalnız damga**, gövdesiz.
 *
 * Tutar ve akıbet (`restock` · `discard` · `goodwill`) BURADA seçilmez; iade siparişte yaşıyor
 * (DOMAIN §8). Tasarımın çekmecesi karar setini talebe koyuyor, sistem siparişe — bu uç o farkın
 * talep tarafındaki tek meşru yarısı.
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
