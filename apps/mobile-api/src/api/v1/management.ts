import { Hono } from 'hono';
import type { z } from 'zod';
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
  readManagementHub,
  replyAsStaff,
} from '@lezzet/application';
import { WarehouseService, serviceDb } from '@lezzet/database';
import {
  ComplaintDraftRequestSchema,
  ComplaintDraftResponseSchema,
  ComplaintReplyRequestSchema,
  ComplaintResponseSchema,
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
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { readJsonBody, UuidSchema } from '../../lib/request';
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
  const warehouses = await new WarehouseService(serviceDb()).list({ activeOnly: true });
  return warehouses.filter((warehouse) => warehouse.kind === 'facility').map((warehouse) => warehouse.id);
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

/** "Üstlen — İşlemde": durum kapısından geçer (izni motor verir; open→in_progress dışındaki hâl reddolur). */
management.post('/complaints/:id/claim', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'invalid_id', 400);

  const result = await changeTicketStatus(serviceDb(), { ticketId: id.data, to: 'in_progress', by: 'staff' });
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
