import 'server-only';
import { TicketService, serviceDb } from '@lezzet/database';
import { canTriggerReturn, statusAfterCustomerReply } from '@lezzet/domain-core';
import {
  changeTicketStatus as appChangeTicketStatus,
  consumeTicketDraft as appConsumeTicketDraft,
  openTicket as appOpenTicket,
  replyAsStaff as appReplyAsStaff,
  takeOverTicket as appTakeOverTicket,
  ticketAttachmentsBelongTo,
  translateTicketMessageNow,
  type TicketWriteResult,
} from '@lezzet/application';
import type { Ticket, TicketMessage, TicketStatus, TicketType } from '@lezzet/types';

/**
 * Talep yazımları (16.1) — personel yarısı artık KÖPRÜ (terfi 21.12).
 *
 * `openTicket` · `replyAsStaff` · `changeTicketStatus` · `takeOverTicket` · `consumeTicketDraft`
 * gövdeleriyle `@lezzet/application/ticket/staff-write`a taşındı: mobil yönetim (Y1/Y2) aynı
 * kapıları çağırıyor ve kural iki yerde iki kez yaşayamazdı. Ek sahiplik kuralı da paketten
 * (`ticketAttachmentsBelongTo`). Web çağıranları `db` geçmez — köprü `serviceDb()` bağlar
 * (notify köprüsünün deseni).
 *
 * Burada GÖVDESİYLE kalanlar yalnız web'e özgü müşteri/mod kapıları: `replyAsCustomer` ·
 * `setTicketMode` · `triggerReturnFromTicket`.
 */

export type { TicketWriteResult };

/** Talep açılışı — KÖPRÜ (gövde: `staff-write.openTicket`; müşteri ve personel aynı kapıdan). */
export function openTicket(input: {
  customerId: string;
  source: Ticket['source'];
  type: TicketType;
  body: string;
  orderId?: string | null;
  orderItemIds?: string[];
  conversationId?: string | null;
  subject?: string | null;
  attachments?: string[];
  authorId?: string | null;
}): Promise<TicketWriteResult<Ticket>> {
  return appOpenTicket(serviceDb(), input);
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
  const db = serviceDb();
  const service = new TicketService(db);
  const ticket = await service.getById(input.ticketId);
  // Başkasının talebine yazılamaz — ve "yok" ile "senin değil" ekrana aynı cümleyi kurar.
  if (!ticket || ticket.customerId !== input.customerId) return { ok: false, reason: 'not_found' };
  if (!ticketAttachmentsBelongTo(input.attachments, { customerId: input.customerId, ticketId: ticket.id })) {
    return { ok: false, reason: 'attachment_not_yours' };
  }

  const message = await service.reply({
    ticketId: ticket.id,
    sender: 'customer',
    body: input.body.trim(),
    attachments: input.attachments,
    newStatus: statusAfterCustomerReply(ticket.status),
  });
  /* Çeviri GÖNDERİM ANINDA (17.08) — operatör bu mesajı ilk görüşte Türkçe okusun; künyesi
     `translateTicketMessageNow`da. Düşerse mesaj yine yazılmıştır, satır kuyrukta kalır. */
  await translateTicketMessageNow(db, message);
  return { ok: true, data: message };
}

/** Personelin cevabı — KÖPRÜ (gövde: `staff-write.replyAsStaff`; çeviri → mail kuyruğu → zil sırası orada). */
export function replyAsStaff(input: {
  ticketId: string;
  authorId: string;
  body: string;
  attachments?: string[];
}): Promise<TicketWriteResult<TicketMessage>> {
  return appReplyAsStaff(serviceDb(), input);
}

/** Durum değişimi — KÖPRÜ (gövde: `staff-write.changeTicketStatus`; izni motor verir). */
export function changeTicketStatus(input: {
  ticketId: string;
  to: TicketStatus;
  by: 'customer' | 'staff';
  customerId?: string;
}): Promise<TicketWriteResult<Ticket>> {
  return appChangeTicketStatus(serviceDb(), input);
}

/** AI'dan devralma — KÖPRÜ (gövde: `staff-write.takeOverTicket`). */
export function takeOverTicket(ticketId: string): Promise<TicketWriteResult<Ticket>> {
  return appTakeOverTicket(serviceDb(), ticketId);
}

/**
 * Yürütücü modunu değiştir (kullanıcı kararı 16.08): human · hybrid · ai. Motor (16.5) henüz yok
 * ama mod bir VERİ kararıdır ve bugünden yazılır. Aynı moda "geçmek" reddedilir: ekran o düğmeyi
 * zaten seçili gösterir, yine de gelen çağrı bir yarışın işaretidir ve sessizce yutulmamalı.
 */
export async function setTicketMode(ticketId: string, mode: Ticket['handledBy']): Promise<TicketWriteResult<Ticket>> {
  const service = new TicketService(serviceDb());
  const ticket = await service.getById(ticketId);
  if (!ticket) return { ok: false, reason: 'not_found' };
  if (ticket.handledBy === mode) return { ok: false, reason: 'already_in_mode' };
  return { ok: true, data: await service.setMode(ticket.id, mode) };
}

/** Hibrit taslağı tüket — KÖPRÜ (gövde: `staff-write.consumeTicketDraft`; önce gönder, sonra temizle). */
export function consumeTicketDraft(input: {
  ticketId: string;
  authorId: string;
  send: boolean;
}): Promise<TicketWriteResult<{ ticket: Ticket; draft: string }>> {
  return appConsumeTicketDraft(serviceDb(), input);
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
