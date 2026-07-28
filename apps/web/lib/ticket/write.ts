import 'server-only';
import { TicketService, serviceDb } from '@lezzet/database';
import {
  canTransitionTicket,
  canTriggerReturn,
  checkTicketDraft,
  statusAfterCustomerReply,
  statusAfterStaffReply,
} from '@lezzet/domain-core';
import type { Ticket, TicketMessage, TicketStatus, TicketType } from '@lezzet/types';

/**
 * Talep yazımları (16.1) — **kapı**: motora sorar, servise yazdırır (STACK §4).
 *
 * Her kapı `{ ok }` biçiminde bir sonuç döner, fırlatmaz: reddin sebebi ekranın müşteriye
 * söyleyeceği cümledir; exception'a çevrilirse o cümle kaybolur ve geriye "bir hata oluştu" kalır.
 *
 * **Sahiplik ve rol burada kontrol edilmez, imzada durur:** müşteri kapıları `customerId`,
 * personel kapıları `authorId` ister ve çağıran onu guard'dan alır (`currentCustomerId`,
 * `requireStaff`). Kapı kendi başına oturum okusaydı WhatsApp'tan gelen çağrı (oturumsuz) hiç
 * çalışmazdı.
 */

export type TicketWriteResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/**
 * Müşterinin talep açması (16.2'nin arka ucu). Talep ve ilk mesaj **tek turda** yazılır — açan
 * kişinin ne dediği bilinmeyen bir talep kuyruğa düşmemeli.
 */
export async function openTicket(input: {
  customerId: string;
  source: Ticket['source'];
  type: TicketType;
  /** Müşterinin anlatımı — talebin ilk mesajı. Boş olamaz: anlatımsız talep, çözülemeyen taleptir. */
  body: string;
  orderId?: string | null;
  orderItemIds?: string[];
  conversationId?: string | null;
  subject?: string | null;
  attachments?: string[];
  /** Personel elle açıyorsa kendi kimliği; müşteri kendi açtığında boş. */
  authorId?: string | null;
}): Promise<TicketWriteResult<Ticket>> {
  const draft = checkTicketDraft(input);
  if (!draft.ok) return { ok: false, reason: draft.reason };
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };

  const ticket = await new TicketService(serviceDb()).createWithMessage({
    ...input,
    body: input.body.trim(),
    // Personelin elle açtığı talepte ilk sözü o söyler; müşterinin kendi açtığında müşteri.
    sender: input.authorId ? 'admin' : 'customer',
  });
  return { ok: true, data: ticket };
}

/**
 * Müşterinin cevabı. **Kapanmış talep kendiliğinden yeniden açılır** (motorun kararı): "yeniden aç"
 * ile "yaz" ayrı iki düğme olsaydı müşteri yazar, düğmeye basmayı unutur ve mesajı kimsenin
 * bakmadığı kapalı bir talebin içinde kalırdı.
 */
export async function replyAsCustomer(input: {
  customerId: string;
  ticketId: string;
  body: string;
  attachments?: string[];
}): Promise<TicketWriteResult<TicketMessage>> {
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(input.ticketId);
  // Başkasının talebine yazılamaz — ve "yok" ile "senin değil" ekrana aynı cümleyi kurar.
  if (!ticket || ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };

  const message = await service.reply({
    ticketId: ticket.id,
    sender: 'customer',
    body: input.body.trim(),
    attachments: input.attachments,
    newStatus: statusAfterCustomerReply(ticket.status),
  });
  return { ok: true, data: message };
}

/**
 * Personelin cevabı — müşteriye **aynen** görünür (iç not yoktur, DOMAIN §15).
 *
 * Cevap yazmak durumu kendiliğinden değiştirmez: tasarım durum değiştirmeyi ayrı bir aksiyon
 * olarak sunuyor, sessiz geçiş operatörün vermediği bir kararı ona mal etmek olurdu.
 */
export async function replyAsStaff(input: {
  ticketId: string;
  authorId: string;
  body: string;
  attachments?: string[];
}): Promise<TicketWriteResult<TicketMessage>> {
  if (input.body.trim().length === 0) return { ok: false, reason: 'empty_body' };
  const service = new TicketService(serviceDb());
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
  return { ok: true, data: message };
}

/**
 * Durum değişimi — izni motor verir (`canTransitionTicket`), damgayı servis basar.
 *
 * Aktör ayrımı burada gerçek bir kapıdır: müşteri kendi talebini "çözüldü" yapamaz, yalnız
 * kapanmış olanı yeniden açabilir.
 */
export async function changeTicketStatus(input: {
  ticketId: string;
  to: TicketStatus;
  by: 'customer' | 'staff';
  /** Müşteri tarafında sahiplik kontrolü için; personelde gerekmez. */
  customerId?: string;
}): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(input.ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (input.by === 'customer' && ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };

  const check = canTransitionTicket(ticket.status, input.to, input.by);
  if (!check.allowed) return { ok: false, reason: check.reason };

  return { ok: true, data: await service.setStatus(ticket.id, input.to) };
}

/**
 * AI'dan devralma (16.5'in arka ucu). Bugün her talep zaten `human`'dır; kapı yine de var, çünkü
 * ekranın "Devral" düğmesi AI gelmeden önce çizilecek ve çağıracağı bir uç olmalı.
 */
export async function takeOverTicket(ticketId: string): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === 'human') return { ok: false, reason: 'already_human' };
  return { ok: true, data: await service.takeOver(ticket.id) };
}

/**
 * İade akışını bu talepten başlat — **yalnız damga.**
 *
 * Para ve stok burada HİÇ hareket etmez: iade siparişte yaşar (`adjustFulfillment` +
 * `recordForOrder`, 07.9) ve operatör oraya yönlendirilir. Bu kapı yalnız "iadeyi hangi talep
 * doğurdu" sorusunu cevaplanabilir kılar; ikinci bir iade arayüzü kurmaz (DOMAIN §8).
 */
export async function triggerReturnFromTicket(ticketId: string): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };

  const check = canTriggerReturn(ticket);
  if (!check.allowed) return { ok: false, reason: check.reason };

  return { ok: true, data: await service.markReturnTriggered(ticket.id) };
}
