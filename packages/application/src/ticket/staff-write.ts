import type { SupabaseClient } from '@supabase/supabase-js';
import { OrderItemService, OrderService, TicketService } from '@lezzet/database';
import { canTransitionTicket, canTriggerReturn, checkTicketDraft, statusAfterStaffReply } from '@lezzet/domain-core';
import { ticketAttachmentScope } from '@lezzet/storage';
import type { Ticket, TicketHandler, TicketMessage, TicketStatus, TicketType } from '@lezzet/types';
import { defaultTicketHandler } from '../messaging/default-handler';
import { notifyTicketReceived, notifyTicketReplied, notifyTicketStatusChanged } from './notify';
import { queueTicketReplyMail } from './reply-mail';
import { ringTicketBell } from '../realtime/bell';
import { translateTicketMessageNow } from './translate';

/*
  Kapılar fırlatmaz, `{ ok }` döner, çünkü reddin sebebi ekranın kullanıcıya söyleyeceği cümledir. Rol burada okunmaz, imzada
  durur: personel kapıları `authorId` ister, ki cron'dan gelen çağrı da oturumsuz çalışabilsin.
*/

export type TicketWriteResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * Ekler yalnız çağıranın kendi alanından gelebilir; sahiplik talepte değil anahtarda sorulur, yoksa müşteri private kovadaki
 * herhangi bir dosyayı kendi talebine iliştirip okutabilirdi. Biçimi tanınmayan anahtar kabul edilmez.
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
 * Talep ve ilk mesaj tek turda yazılır, ki anlatımı olmayan talep kuyruğa düşmesin. Açan mesaj anında çevrilmez, kuyruğa bırakılır,
 * çünkü çeviri bir LLM turudur ve burada onu bekletecek bir zil yok.
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
    handledBy: await defaultTicketHandler(db),
  });
  // Teyit maili — talep kaydedildikten SONRA ve beklenerek: gönderim kendi içinde sessiz, ama
  // beklemezsek çağıran süreç mail gitmeden sonlanabilir.
  await notifyTicketReceived(db, ticket, input.authorId ? 'staff' : 'customer');
  return { ok: true, data: ticket };
}

/**
 * Personelin cevabı müşteriye aynen görünür, iç not yoktur (DOMAIN §15). İlk cevap açık talebi işleme alır (`statusAfterStaffReply`).
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

  // Çeviri haberden ve zilden önce: müşteri operatörün Türkçe yazdığını ilk görüşte kendi dilinde görmeli.
  await translateTicketMessageNow(db, message);

  // Cihaz bildirimi hemen gider, e-posta okunmamışsa sonra; yazışmayı o an açık tutan müşteride uygulama bildirimi göstermez.
  await notifyTicketReplied(db, ticket);
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
  // bildirim katmanı verir, burası olayı bildirmekle yetinir.
  await notifyTicketStatusChanged(db, updated, ticket.status, input.by);
  return { ok: true, data: updated };
}

/**
 * Talebin türünü düzelt; tür bir sınıflandırmadır ve geçiş kuralı yoktur, iade tetiği türe değil siparişe ve damgaya bakar. Aynı
 * türe geçmek reddedilir, çünkü ekran o düğmeyi zaten seçili gösterir ve gelen çağrı bir yarışın işaretidir.
 */
export async function setTicketType(
  db: SupabaseClient,
  input: { ticketId: string; type: TicketType },
): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.type === input.type) return { ok: false, reason: 'already_in_type' };
  return { ok: true, data: await service.setType(ticket.id, input.type) };
}

/** Yürütücü modunu değiştir; aynı moda geçmek reddedilir, çünkü gelen çağrı bir yarışın işaretidir. */
export async function setTicketMode(
  db: SupabaseClient,
  input: { ticketId: string; mode: TicketHandler },
): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === input.mode) return { ok: false, reason: 'already_in_mode' };
  return { ok: true, data: await service.setMode(ticket.id, input.mode) };
}

/**
 * İade akışını bu talepten başlatır, yalnız damgayla: para, stok ve akıbet siparişte seçilir, burada ikinci bir iade arayüzü
 * kurulmaz. Kapı yalnız "iadeyi hangi talep doğurdu" sorusunu cevaplanabilir kılar.
 */
export async function triggerReturnFromTicket(
  db: SupabaseClient,
  ticketId: string,
): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(db);
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };

  const check = canTriggerReturn(ticket);
  if (!check.allowed) return { ok: false, reason: check.reason };

  return { ok: true, data: await service.markReturnTriggered(ticket.id) };
}

/**
 * AI'dan devralma — `ai`'dan da `hybrid`'den de iner; bekleyen taslak servis katında birlikte düşer (devralan taslağı değil
 * sohbeti istedi).
 */
export async function takeOverTicket(db: SupabaseClient, ticketId: string): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(db);
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === 'human') return { ok: false, reason: 'already_human' };
  return { ok: true, data: await service.takeOver(ticket.id) };
}

/**
 * Hibrit taslağı tüket: `send=true` taslak olduğu gibi personel cevabı olur (insanın onayladığı taslak insanın cevabıdır),
 * `send=false` taslak düşer ve metni cevap kutusuna taşınır. Önce gönderilir sonra temizlenir, ki düşen gönderim taslağı yutmasın.
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
