import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderItemService, OrderService, TicketService } from '@lezzet/database';
import { canTransitionTicket, checkTicketDraft, statusAfterStaffReply } from '@lezzet/domain-core';
import { ticketAttachmentScope } from '@lezzet/storage';
import type { Ticket, TicketMessage, TicketStatus, TicketType } from '@lezzet/types';
import { notifyTicketReceived, notifyTicketStatusChanged } from './notify';
import { queueTicketReplyMail } from './reply-mail';
import { ringTicketBell } from '../realtime/bell';
import { translateTicketMessageNow } from './translate';

/*
  PERSONEL TALEP YAZIMLARI — terfi 21.12 (kaynağı `apps/web/lib/ticket/write.ts`in personel yarısı,
  birebir; web köprüyle çağırır). Ölçüt doldu: `openTicket`ı artık üç kapı çağırıyor (web hazırlık
  "müşteriye sor" · web destek · mobil Y1/Y2), `replyAsStaff`i iki yüzey.

  Her kapı `{ ok }` biçiminde bir sonuç döner, fırlatmaz: reddin sebebi ekranın kullanıcıya
  söyleyeceği cümledir; exception'a çevrilirse o cümle kaybolur ve geriye "bir hata oluştu" kalır.

  **Sahiplik ve rol burada kontrol edilmez, imzada durur:** personel kapıları `authorId` ister ve
  çağıran onu guard'dan alır. Kapı kendi başına oturum okusaydı cron'dan gelen çağrı hiç çalışmazdı.
*/

export type TicketWriteResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * **Ekler yalnız çağıranın kendi alanından gelebilir.**
 *
 * Anahtar istemciden geliyor ve okuma kapısı onu imzalı adrese çeviriyor. Sahiplik kontrolü TALEP
 * üzerinde yapılıp anahtar üzerinde yapılmasaydı, müşteri private kovadaki herhangi bir dosyayı
 * kendi talebine iliştirip okutabilirdi — yetki doğrulanmış olurdu ama yanlış nesnenin.
 *
 * `null` scope = biçimi tanınmayan anahtar; kabul edilmez. (Web'in müşteri kapıları da buradan
 * okur — kural tek yerde.)
 */
export function ticketAttachmentsBelongTo(
  attachments: readonly string[] | undefined,
  owner: { customerId: string; ticketId?: string },
): boolean {
  return (attachments ?? []).every((key) => {
    const scope = ticketAttachmentScope(key);
    if (!scope) return false;
    return scope.kind === 'draft' ? scope.customerId === owner.customerId : scope.ticketId === owner.ticketId;
  });
}

/**
 * Siparişin ve işaretli kalemlerin gerçekten bu müşteriye ait olduğu.
 *
 * Bunu ne DB ne motor bilebilir: motor siparişleri görmez, DB'de `ticket.customer_id` ile
 * `order.customer_id` arasında bir kısıt yoktur (olsaydı personelin elle açtığı talep de bozulurdu).
 */
async function checkOrderOwnership(
  db: SupabaseClient,
  input: { customerId: string; orderId?: string | null; orderItemIds?: string[] },
): Promise<{ ok: true } | { ok: false; reason: 'order_not_found' | 'items_not_in_order' }> {
  if (!input.orderId) return { ok: true };

  const order = await new OrderService(db).getById(input.orderId);
  // "Yok" ile "senin değil" ekrana aynı cümleyi kurar: olmayan bir siparişin varlığını doğrulamayız.
  if (!order || order.customerId !== input.customerId) return { ok: false, reason: 'order_not_found' };

  const itemIds = input.orderItemIds ?? [];
  if (itemIds.length === 0) return { ok: true };

  const items = await new OrderItemService(db).listByOrder(input.orderId);
  const own = new Set(items.map((item) => item.id));
  return itemIds.every((id) => own.has(id)) ? { ok: true } : { ok: false, reason: 'items_not_in_order' };
}

/**
 * Talep açılışı — müşteri kendi açar ya da personel müşteri adına açar; talep ve ilk mesaj **tek
 * turda** yazılır (açan kişinin ne dediği bilinmeyen bir talep kuyruğa düşmemeli).
 *
 * AÇAN MESAJ ANINDA ÇEVRİLMEZ, KUYRUĞA BIRAKILIR (ölçülmüş karar, 25.08): çeviri bir LLM turudur
 * ve açanın ekranını 3-6 sn bekletiyordu. `replyAsStaff`teki aciliyetin sebebi ZİLDİR; burada zil
 * yok — personelin açtığı talepte müşteriye teyit maili de gitmiyor (16.4).
 */
export async function openTicket(
  db: SupabaseClient,
  input: {
    customerId: string;
    source: Ticket['source'];
    type: TicketType;
    /** Açanın anlatımı — talebin ilk mesajı. Boş olamaz: anlatımsız talep, çözülemeyen taleptir. */
    body: string;
    orderId?: string | null;
    orderItemIds?: string[];
    conversationId?: string | null;
    subject?: string | null;
    attachments?: string[];
    /** Personel elle açıyorsa kendi kimliği; müşteri kendi açtığında boş. */
    authorId?: string | null;
  },
): Promise<TicketWriteResult<Ticket>> {
  const draft = checkTicketDraft(input);
  if (!draft.ok) return { ok: false, reason: draft.reason };
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  // Yeni talebin henüz kimliği yok: ekler ancak müşterinin kendi taslak klasöründen gelebilir.
  if (!ticketAttachmentsBelongTo(input.attachments, { customerId: input.customerId })) {
    return { ok: false, reason: 'attachment_not_yours' };
  }

  // **Personel elle açarken sahiplik aranmaz:** operatör müşteri adına talep açar ve siparişi o
  // seçer; kendi kimliğiyle eşleşmesi beklenemez. Kontrol MÜŞTERİNİN açtığı talebe aittir.
  if (!input.authorId) {
    const owns = await checkOrderOwnership(db, input);
    if (!owns.ok) return { ok: false, reason: owns.reason };
  }

  const ticket = await new TicketService(db).createWithMessage({
    ...input,
    body: input.body.trim(),
    // Personelin elle açtığı talepte ilk sözü o söyler; müşterinin kendi açtığında müşteri.
    sender: input.authorId ? 'admin' : 'customer',
  });
  // Teyit maili — talep kaydedildikten SONRA ve beklenerek: gönderim kendi içinde sessiz, ama
  // beklemezsek çağıran süreç mail gitmeden sonlanabilir.
  await notifyTicketReceived(db, ticket, input.authorId ? 'staff' : 'customer');
  return { ok: true, data: ticket };
}

/**
 * Personelin cevabı — müşteriye **aynen** görünür (iç not yoktur, DOMAIN §15).
 *
 * Cevap yazmak durumu kendiliğinden değiştirmez: durum değiştirme ayrı bir aksiyondur, sessiz
 * geçiş operatörün vermediği bir kararı ona mal etmek olurdu.
 */
export async function replyAsStaff(
  db: SupabaseClient,
  input: { ticketId: string; authorId: string; body: string; attachments?: string[] },
): Promise<TicketWriteResult<TicketMessage>> {
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };

  const message = await service.reply({
    ticketId: ticket.id,
    sender: 'admin',
    authorId: input.authorId,
    body: input.body.trim(),
    attachments: input.attachments,
    newStatus: statusAfterStaffReply(ticket.status),
  });

  /* ÇEVİRİ HABERDEN VE ZİLDEN ÖNCE (kullanıcı bulgusu 17.08): operatör Türkçe yazıyor; müşteri
     mesajı İLK görüşte kendi dilinde görmeli. Künyesi `translateTicketMessageNow`da. */
  await translateTicketMessageNow(db, message);

  /* MAİL ANINDA GİTMEZ, KUYRUĞA GİRER (16.08 — künyesi `reply-mail.ts`de): müşteri ekranı açıksa
     cevabı zil sayesinde zaten anında görüyor; o an giden mail gürültüdür. */
  await queueTicketReplyMail(db, ticket);
  /* MÜŞTERİNİN KANALI — operasyon zilinden ayrı (künyesi `ringTicketBell`de). Zil sessizdir:
     çalmazsa cevap yine yazılmıştır, ekran biraz geç görür. */
  await ringTicketBell(ticket.id);
  return { ok: true, data: message };
}

/**
 * Durum değişimi — izni motor verir (`canTransitionTicket`), damgayı servis basar.
 * Aktör ayrımı gerçek bir kapıdır: müşteri kendi talebini "çözüldü" yapamaz.
 */
export async function changeTicketStatus(
  db: SupabaseClient,
  input: {
    ticketId: string;
    to: TicketStatus;
    by: 'customer' | 'staff';
    /** Müşteri tarafında sahiplik kontrolü için; personelde gerekmez. */
    customerId?: string;
  },
): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (input.by === 'customer' && ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };

  const check = canTransitionTicket(ticket.status, input.to, input.by);
  if (!check.allowed) return { ok: false, reason: check.reason };

  const updated = await service.setStatus(ticket.id, input.to);
  // Yalnız "çözüldü" ve "yeniden açıldı" haber doğurur, ve yalnız PERSONEL yaptığında — kararı
  // bildirim katmanı verir (16.4), burası olayı bildirmekle yetinir.
  await notifyTicketStatusChanged(db, updated, ticket.status, input.by);
  return { ok: true, data: updated };
}

/**
 * AI'dan devralma (16.5'in arka ucu) — `ai`'dan da `hybrid`'den de iner; bekleyen taslak servis
 * katında birlikte düşer (devralan taslağı değil sohbeti istedi).
 */
export async function takeOverTicket(db: SupabaseClient, ticketId: string): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(db);
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === 'human') return { ok: false, reason: 'already_human' };
  return { ok: true, data: await service.takeOver(ticket.id) };
}

/**
 * Hibrit taslağı tüket (16.08) — mobildeki desenin arka ucu (`complaint-screen` v2:548).
 *
 * İki çıkış, tek kapı:
 *   · `send=true` — "Cevaba çevir": taslak OLDUĞU GİBİ personel cevabı olur. Gönderen `admin`dir,
 *     `ai` değil (20-yapay-zeka §75: insanın onayladığı taslak insanın cevabıdır).
 *   · `send=false` — "Düzenleyerek gönder": taslak satırdan düşer, metni ekran cevap kutusuna taşır.
 *
 * Sıra bilinçli: önce gönder, SONRA temizle — gönderim düşerse taslak yerinde kalır ve operatör
 * yeniden deneyebilir. Ters sıra, düşen gönderimde taslağı sessizce yutardı.
 */
export async function consumeTicketDraft(
  db: SupabaseClient,
  input: { ticketId: string; authorId: string; send: boolean },
): Promise<TicketWriteResult<{ ticket: Ticket; draft: string }>> {
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  const draft = ticket.aiDraftReply;
  if (!draft) return { ok: false, reason: 'no_draft' };

  if (input.send) {
    const sent = await replyAsStaff(db, { ticketId: ticket.id, authorId: input.authorId, body: draft });
    if (!sent.ok) return sent;
  }
  return { ok: true, data: { ticket: await service.clearDraft(ticket.id), draft } };
}
