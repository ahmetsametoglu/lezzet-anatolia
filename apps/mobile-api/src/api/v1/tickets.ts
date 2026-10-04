import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  getCustomerTicket,
  listCustomerTickets,
  notifyTicketReceived,
  openCustomerTicket,
  replyToCustomerTicket,
  requestTicketUploadUrl,
  type CustomerTicketView,
  type OpenCustomerTicketOutcome,
  type ReplyToTicketOutcome,
  type TicketUploadOutcome,
} from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import {
  DEFAULT_PAGE_SIZE,
  MeTicketDetailSchema,
  MeTicketPageSchema,
  PreferredLanguageEnum,
  TicketCreatedSchema,
  TicketOpenSchema,
  TicketReplySchema,
  TicketUploadRequestSchema,
  TicketUploadSchema,
  type TicketOpenError,
  type TicketReplyError,
  type TicketUploadError,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, readJsonBody } from '../../lib/request';
import type { V1Env } from './auth';

/*
  `/me/tickets`: talep listesi, detay ve yeni talep; kural `@lezzet/application`ın talep kapılarında, web `/support` ile aynı, burası
  yalnız taşır. Bearer arkasında durur, çünkü talep müşterinin kendisidir ve oturumsuz gezilmez.
*/

/** Sayfa boyutu tavanı: tek istekle arşivi boşaltmak sayfalamayı anlamsız kılar. */
const MAX_PAGE_SIZE = 50;

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`); kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profili olmayan auth kullanıcısı `GET /me` ile aynı cevabı alır (`profile_not_found`, 404), çünkü boş liste uydurmak arızayı görünmez
 * kılardı. Aynı çözüm `addresses.ts` ve `orders.ts`te de var; ayrışırlarsa bir bölüm 404 derken öteki boş liste döner.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/** Liste dilsizdir, çünkü talep satırında çözülen metin yok: tür ve durum ekranın sözlüğünde çevrilir, başlık ve numara ham dizedir. */
const ListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * Detay ve cevap uçlarının dili zorunlu ve varsayılansız: işaretli kalemlerin ürün adı ve yazışmanın çeviri yönü buna bağlı. Varsayılan
 * olsaydı dilini göndermeyi unutan ekran herkese aynı dili gösterir ve bu hiçbir yerde hata vermezdi.
 */
function localeOf(c: Context<CustomerEnv>): ReturnType<typeof PreferredLanguageEnum.safeParse> {
  return PreferredLanguageEnum.safeParse(c.req.query('locale'));
}

/** Kapının görünümü → sözleşme şekli; `z.input` kilittir, kapı saparsa burası derlenmez. */
function toDetailBody(view: CustomerTicketView): z.input<typeof MeTicketDetailSchema> {
  return {
    id: view.id,
    type: view.type,
    status: view.status,
    subject: view.subject,
    createdAt: view.createdAt,
    lastMessageAt: view.lastMessageAt,
    orderReference: view.orderReferenceNo,
    messages: view.messages.map((message) => ({
      id: message.id,
      createdAt: message.createdAt,
      // `ai` göndericisi de işletmedir; eşleme tek yerde, yoksa iki yüzey aynı mesajın göndericisini farklı gösterebilirdi.
      fromCustomer: message.sender === 'customer',
      body: message.body,
      translated: message.bodyTranslated,
      language: message.language,
      originalBody: message.originalBody,
      photos: message.attachmentUrls,
    })),
    returnOutcome: view.returnOutcome,
  };
}

/**
 * Kapının adlı retleri → sözleşmenin adlı retleri. Tabloda olmayan ret `invalid_body`ye düşer, çünkü bu uçta doğması istemci ile kapının
 * uyumsuzluğudur, müşteriye söylenecek bir cümle değil.
 */
const OPEN_ERRORS: Partial<Record<Exclude<OpenCustomerTicketOutcome['status'], 'ok'>, TicketOpenError>> = {
  empty_body: 'empty_body',
  order_unavailable: 'order_unavailable',
  items_without_order: 'items_without_order',
  attachment_not_yours: 'attachment_not_yours',
};

const REPLY_ERRORS: Partial<Record<Exclude<ReplyToTicketOutcome['status'], 'ok'>, TicketReplyError>> = {
  empty_body: 'empty_body',
  ticket_not_found: 'ticket_not_found',
  attachment_not_yours: 'attachment_not_yours',
};

/** Yükleme adresinin retleri; `not_found` yalnız yazışma ekinde doğar ve "yok" ile "senin değil"i aynı cevapla söyler. */
const UPLOAD_ERRORS: Record<Extract<TicketUploadOutcome, { ok: false }>['reason'], TicketUploadError> = {
  unsupported_type: 'unsupported_type',
  too_many: 'too_many',
  storage_unavailable: 'storage_unavailable',
  not_found: 'ticket_not_found',
};

const UPLOAD_STATUS: Record<TicketUploadError, 400 | 404 | 503> = {
  unsupported_type: 400,
  too_many: 400,
  storage_unavailable: 503,
  ticket_not_found: 404,
};

/**
 * İmzalı yükleme adresi: talep kimliği yoksa açılış taslağına, varsa o talebin klasörüne. Depo yapılandırılmamışsa 503 döner ki
 * istemci "yüklendi" sanıp mesajı eksik göndermesin.
 */
async function uploadUrlFor(c: Context<CustomerEnv>, ticketId: string | null): Promise<Response> {
  const body = TicketUploadRequestSchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await requestTicketUploadUrl(serviceDb(), {
    customerId: c.get('customerId'),
    ticketId,
    filename: body.data.filename,
    alreadyRequested: body.data.alreadyRequested,
  });
  if (!outcome.ok) {
    const key = UPLOAD_ERRORS[outcome.reason];
    return fail(c, key, UPLOAD_STATUS[key]);
  }

  return ok(c, TicketUploadSchema.parse({ key: outcome.key, uploadUrl: outcome.uploadUrl, contentType: outcome.contentType }));
}

export const tickets = new Hono<CustomerEnv>();
tickets.use('*', resolveCustomer);

/**
 * Talep listesi keyset sayfalı ve son mesaja göre sıralı, cevaplanan talep başa çıkar. Bozuk imleç 400 değil listeyi baştan verir:
 * eskimiş bir bağlantı arıza değildir.
 */
tickets.get('/', async (c) => {
  const parsed = ListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return fail(c, 'invalid_query', 400);

  const page = await listCustomerTickets(serviceDb(), {
    customerId: c.get('customerId'),
    cursor: decodeCursor(parsed.data.cursor),
    limit: parsed.data.limit,
  });

  const body: z.input<typeof MeTicketPageSchema> = {
    tickets: page.rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      subject: row.subject,
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
      orderReference: row.orderReferenceNo,
    })),
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
  };
  return ok(c, MeTicketPageSchema.parse(body));
});

/**
 * Yazışmanın tamamı tek turda gelir: yazışma sınırsız büyüyen bir küme değil, tek bir konuşmadır. Bulunamayan ile başkasına ait aynı
 * 404'ü alır, yoksa deneme yanılmayla başkasının talebinin varlığı doğrulatılabilirdi.
 */
tickets.get('/:id', async (c) => {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const view = await getCustomerTicket(serviceDb(), {
    customerId: c.get('customerId'),
    ticketId: c.req.param('id'),
    locale: locale.data,
  });
  if (!view) return fail(c, 'ticket_not_found', 404);

  return ok(c, MeTicketDetailSchema.parse(toDetailBody(view)));
});

/**
 * Geliş yolu (`source: 'form'`) gövdeden alınmaz, ucun bilgisidir: gövdeden kabul etmek WhatsApp'tan geldiğini söyleyen bir telefona
 * inanmak olurdu. Sipariş referansla bağlanır, çünkü mobil sözleşme sipariş kimliğini taşımaz.
 */
tickets.post('/', async (c) => {
  const body = TicketOpenSchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const db = serviceDb();
  const outcome = await openCustomerTicket(
    db,
    {
      customerId: c.get('customerId'),
      source: 'form',
      type: body.data.type,
      body: body.data.body,
      order: body.data.orderReference ? { reference: body.data.orderReference } : null,
      orderItemIds: body.data.orderItemIds,
      attachments: body.data.attachments,
    },
    { notifyReceived: (ticket) => notifyTicketReceived(db, ticket, 'customer') },
  );
  if (outcome.status !== 'ok') return fail(c, OPEN_ERRORS[outcome.status] ?? 'invalid_body', 400);

  return ok(c, TicketCreatedSchema.parse({ id: outcome.ticket.id }));
});

tickets.post('/uploads', (c) => uploadUrlFor(c, null));
tickets.post('/:id/uploads', (c) => uploadUrlFor(c, c.req.param('id')));

/**
 * Kapanmış talep cevapla kendiliğinden yeniden açılır; ayrı bir "yeniden aç" ucu olsaydı müşteri çağırmayı unutur ve mesajı kapalı
 * talepte kalırdı. Cevap güncel detayı döndürür, çünkü yazım durumu ve son mesaj anını da değiştirir.
 */
tickets.post('/:id/messages', async (c) => {
  const locale = localeOf(c);
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const body = TicketReplySchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await replyToCustomerTicket(serviceDb(), {
    customerId: c.get('customerId'),
    ticketId: c.req.param('id'),
    body: body.data.body,
    locale: locale.data,
    attachments: body.data.attachments,
  });
  if (outcome.status !== 'ok') {
    const key = REPLY_ERRORS[outcome.status] ?? 'invalid_body';
    return fail(c, key, key === 'ticket_not_found' ? 404 : 400);
  }

  return ok(c, MeTicketDetailSchema.parse(toDetailBody(outcome.ticket)));
});
