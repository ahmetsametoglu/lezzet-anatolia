import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import {
  getCustomerTicket,
  listCustomerTickets,
  openCustomerTicket,
  replyToCustomerTicket,
  type CustomerTicketView,
  type OpenCustomerTicketOutcome,
  type ReplyToTicketOutcome,
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
  type TicketOpenError,
  type TicketReplyError,
} from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor, readJsonBody } from '../../lib/request';
import type { V1Env } from './auth';

/*
  `/me/tickets` (21.14 · modül 16) — "Taleplerim" (v3 `vTalepler`), talep detayı (`vTalepD`) ve
  yeni talep (`vTalepNew`).

  KURAL BURADA DEĞİL: sahiplik, sipariş/kalem doğrulaması, ek dosya sahipliği, "kapanmış talebe
  yazmak onu yeniden açar" ve çeviri yönü `@lezzet/application`ın talep kapılarında
  (`ticket/{read,write}.ts` künyeleri) — yani web `/support` sayfasının okuduğu kararların TAM
  AYNISI. Bu dosya TAŞIMA katmanıdır: sorgu dizesini süzer, kimliği çözer, sözleşme şekline
  indirger, zarflar. Burada hesaplanan hiçbir iş kuralı yok.

  BEARER'IN ARKASINDA ve orada kalacak (adres/sipariş uçlarının aynı kararı): talep müşterinin
  kendisidir, katalog gibi oturumsuz gezilmez.

  ── TEYİT MAİLİ BU UÇTAN GİTMEZ (bilinen açık, sessiz değil) ────────────────
  Kapı bir ETKİ PORTU sunuyor (`TicketEffects.notifyReceived`) ama bu uç onu geçiremiyor: teyit
  `@lezzet/notify` + e-posta şablonları ister ve ikisi de `apps/mobile-api`nin bağımlılığı DEĞİL
  (`order/effects.ts`in ölçtüğü aynı sınır — bağımlılık eklemek kök `pnpm-lock.yaml`a dokunmaktır).
  Port kayıtsız olduğu için kapı süreç başına bir kez `logger.warn` basıyor; sessizce atlanmıyor.
  Mobilden açılan talep BUGÜN teyit maili doğurmaz — web'den açılan doğurur.
*/

/** Sayfa boyutu tavanı — siparişlerin aynı kararı: tek istekle arşivi boşaltmak sayfalamayı anlamsız kılar. */
const MAX_PAGE_SIZE = 50;

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü TEK middleware'de — adres ve sipariş uçlarının deseni BİREBİR. Profili olmayan auth
 * kullanıcısı `GET /me` ile aynı cevabı alır (`profile_not_found`, 404): trigger boşluğu ya da
 * silinmiş kayıt; boş liste uydurmak arızayı görünmez kılardı.
 *
 * ÜÇÜNCÜ KOPYA VE BUNUN FARKINDAYIM (CLAUDE §1): aynı on satır `addresses.ts` ve `orders.ts`ta da
 * duruyor. Doğrusu `lib/customer.ts`e çıkarmaktır — bu görevin yazma alanı yalnız bu dosya olduğu
 * için çıkarma yapılmadı ve ihtiyaç rapora yazıldı. Üç kopyanın ayrışması hâlinde arıza şöyle
 * görünür: bir bölüm 404 derken öteki boş liste döner.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/**
 * Liste sorgusu — **`locale` YOK ve bu bir eksiklik değil, ölçüm sonucu.**
 *
 * Sipariş listesi dili zorunlu istiyor çünkü satırlarında ÜRÜN ADI var ve `resolveLocalizedText`
 * dilsiz çağrıda sessizce Türkçeye düşer. Talep satırında çözülen tek bir metin yok: tür ve durum
 * kapalı enum'lar (ekranın sözlüğünde çevriliyor), başlık ile sipariş numarası ham dize, tarihler
 * ISO. Kullanılmayan bir parametreyi zorunlu kılmak, sözleşmeyi taklitle büyütmek olurdu.
 */
const ListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * Detay ve cevap uçlarının dili — ZORUNLU ve varsayılansız (katalog/sipariş uçlarının kuralı).
 *
 * İki yerde kullanılıyor: işaretli kalemlerin ürün adı (`resolveLocalizedText`) ve yazışmanın
 * ÇEVİRİ YÖNÜ (20.2 — personelin Türkçe cevabı müşteriye kendi dilinde açılır). Varsayılan
 * koysaydık, dilini göndermeyi unutan bir ekran herkese aynı dili gösterir ve bu hiçbir yerde hata
 * vermezdi.
 */
function localeOf(c: Context<CustomerEnv>): ReturnType<typeof PreferredLanguageEnum.safeParse> {
  return PreferredLanguageEnum.safeParse(c.req.query('locale'));
}

/** Kapının görünümü → sözleşme şekli. `z.input` KİLİTTİR: kapı saparsa burası DERLENMEZ. */
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
      // `ai` göndericisi de İŞLETMEDİR — eşleme TEK yerde (sözleşme künyesi); ekran ham `sender`
      // görmez, yoksa 16.5 geldiği gün iki yüzey iki farklı şey gösterirdi.
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
 * Kapının adlı retleri → sözleşmenin adlı retleri.
 *
 * Tabloda OLMAYAN ret `invalid_body`ye düşer ve bu bilinçli: `attachment_not_yours` gibi sebepler
 * kapının kümesinde var (web ek dosya gönderiyor) ama BU uç ek göndermiyor — yani buraya düşmesi
 * bir istemci/kapı uyumsuzluğudur, müşteriye söylenecek bir cümle değil. Enum'a eklemek, ekranın
 * asla kuramayacağı bir metni sözleşmeye yazmak olurdu.
 */
const OPEN_ERRORS: Partial<Record<Exclude<OpenCustomerTicketOutcome['status'], 'ok'>, TicketOpenError>> = {
  empty_body: 'empty_body',
  order_unavailable: 'order_unavailable',
  items_without_order: 'items_without_order',
};

const REPLY_ERRORS: Partial<Record<Exclude<ReplyToTicketOutcome['status'], 'ok'>, TicketReplyError>> = {
  empty_body: 'empty_body',
  ticket_not_found: 'ticket_not_found',
};

export const tickets = new Hono<CustomerEnv>();
tickets.use('*', resolveCustomer);

/**
 * "Taleplerim" — keyset sayfalı, SON MESAJA göre sıralı (kapının kararı: cevaplanan talep başa
 * çıkar). İmleç telde OPAK bir dizedir; bozuk imleç 400 değil, listeyi BAŞTAN verir
 * (`decodeCursor` künyesi) — eskimiş bir bağlantı bir arıza değildir.
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
 * Talep detayı — yazışmanın TAMAMI tek turda (mesaj sayfalaması yok: yazışma sınırsız büyüyen bir
 * küme değil, tek bir konuşmadır — DOMAIN §15).
 *
 * **Bulunamayan ile BAŞKASINA AİT aynı cevabı alır** (404 `ticket_not_found`): ayrım söylenirse
 * deneme yanılmayla başkasının talebinin varlığı doğrulatılabilirdi. Karar kapının içinde (`null`
 * döner), burada yalnız HTTP karşılığı veriliyor.
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
 * Yeni talep (v3 `vTalepNew`) — `source: 'form'` ve bu GÖVDEDEN GELMEZ.
 *
 * Geliş yolu istemcinin beyanı değil, ucun bilgisidir: gövdeden kabul etmek, WhatsApp'tan geldiğini
 * söyleyen bir telefona inanmak olurdu. Uygulamadaki her talep formdan yazılıyor — sipariş
 * detayından gelinse bile kaynak formdur (web `openTicketAction`ın aynı kararı; `order` kaynağı
 * WhatsApp/operatör akışlarının işi).
 *
 * Sipariş REFERANSLA bağlanıyor: mobil sözleşmesi sipariş UUID'sini bilerek taşımıyor.
 */
tickets.post('/', async (c) => {
  const body = TicketOpenSchema.safeParse(await readJsonBody(c));
  if (!body.success) return fail(c, 'invalid_body', 400);

  const outcome = await openCustomerTicket(serviceDb(), {
    customerId: c.get('customerId'),
    source: 'form',
    type: body.data.type,
    body: body.data.body,
    order: body.data.orderReference ? { reference: body.data.orderReference } : null,
    orderItemIds: body.data.orderItemIds,
  });
  if (outcome.status !== 'ok') return fail(c, OPEN_ERRORS[outcome.status] ?? 'invalid_body', 400);

  return ok(c, TicketCreatedSchema.parse({ id: outcome.ticket.id }));
});

/**
 * Yazışmaya cevap. **Kapanmış talep kendiliğinden yeniden açılır** (motorun kararı) — ayrı bir
 * "yeniden aç" ucu YOK: olsaydı müşteri yazar, çağırmayı unutur ve mesajı kapalı bir talepte
 * kalırdı.
 *
 * Cevap GÜNCEL DETAYI döndürür (adres uçlarının "cevap hep güncel liste" kararı): yazım durumu ve
 * son mesaj anını da oynatıyor, tek kaydı dönmek ekranı kendi durumunu tahmin etmeye zorlardı.
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
  });
  if (outcome.status !== 'ok') {
    const key = REPLY_ERRORS[outcome.status] ?? 'invalid_body';
    return fail(c, key, key === 'ticket_not_found' ? 404 : 400);
  }

  return ok(c, MeTicketDetailSchema.parse(toDetailBody(outcome.ticket)));
});
