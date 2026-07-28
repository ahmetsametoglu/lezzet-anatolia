import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import type { Ticket } from '@lezzet/types';
import { countOpenTickets, getCustomerTicket, getStaffTicketDetail, listCustomerTickets, listTicketQueue, listTicketsForOrder } from './read';
import { changeTicketStatus, openTicket, replyAsCustomer, replyAsStaff, takeOverTicket, triggerReturnFromTicket, type TicketWriteResult } from './write';

/**
 * Talep akışının uçtan uca sınanması (16.1) — iki yüzeyin ortak kapısı.
 *
 * Sınanan şey **davranış**, alan değil: müşteri kapanmış talebe yazınca ne olur, başkasının
 * talebini açmaya çalışınca ne görür, iade iki kez tetiklenebilir mi.
 */
const db = serviceDb();
const tickets = new TicketService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const createdProfiles: string[] = [];
const createdTickets: string[] = [];
let customerId: string;
let otherCustomerId: string;
let staffId: string;

beforeAll(async () => {
  const customer = await profiles.insert({ name: 'Ayşe Kaya', email: `talep-${stamp}@example.test` });
  const other = await profiles.insert({ name: 'Marc Dubois', email: `talep-other-${stamp}@example.test` });
  const staff = await profiles.insert({ name: 'Depo Sorumlusu', email: `talep-staff-${stamp}@example.test` });
  customerId = customer.id;
  otherCustomerId = other.id;
  staffId = staff.id;
  createdProfiles.push(customer.id, other.id, staff.id);
});

afterAll(async () => {
  for (const id of createdTickets) await db.from('ticket').delete().eq('id', id);
  await purgeTestData(db, { profileIds: createdProfiles });
});

/** Siparişsiz genel talep — testlerin çoğu için yeterli zemin. */
async function openPlainTicket(body = 'Teslimat bölgeniz Strasbourg dışına çıkıyor mu?') {
  const result = await openTicket({ customerId, source: 'form', type: 'question', body });
  if (!result.ok) throw new Error(`talep açılamadı: ${result.reason}`);
  createdTickets.push(result.data.id);
  return result.data;
}

describe('talep açma', () => {
  it('talep ve ilk mesaj tek turda yazılır — anlatımsız talep kuyruğa düşmez', async () => {
    const ticket = await openPlainTicket('Pakette 5 gözleme yerine 4 vardı.');
    const view = await getCustomerTicket('tr', customerId, ticket.id);

    expect(view?.status).toBe('open');
    expect(view?.messages).toHaveLength(1);
    expect(view?.messages[0]).toMatchObject({ sender: 'customer', body: 'Pakette 5 gözleme yerine 4 vardı.' });
  });

  it('siparişsiz talepte kalem işaretlenemez', async () => {
    const result = await openTicket({
      customerId,
      source: 'form',
      type: 'damaged',
      body: 'Ezilmiş gelmiş',
      orderItemIds: ['00000000-0000-0000-0000-000000000001'],
    });
    expect(result).toEqual({ ok: false, reason: 'items_without_order' });
  });

  it('sipariş detayından gelen talep siparişsiz açılamaz', async () => {
    const result = await openTicket({ customerId, source: 'order', type: 'missing', body: 'Eksik geldi' });
    expect(result).toEqual({ ok: false, reason: 'order_source_without_order' });
  });

  it('boş anlatımla talep açılmaz', async () => {
    const result = await openTicket({ customerId, source: 'form', type: 'other', body: '   ' });
    expect(result).toEqual({ ok: false, reason: 'empty_body' });
  });
});

describe('sahiplik', () => {
  it('başkasının talebi "yok" görünür — varlığı doğrulanmaz', async () => {
    const ticket = await openPlainTicket();
    expect(await getCustomerTicket('tr', otherCustomerId, ticket.id)).toBeNull();

    const reply = await replyAsCustomer({ customerId: otherCustomerId, ticketId: ticket.id, body: 'merhaba' });
    expect(reply).toEqual({ ok: false, reason: 'not_found' });
  });

  it('müşteri yalnız kendi taleplerini listeler', async () => {
    const ticket = await openPlainTicket();
    const page = await listCustomerTickets(customerId);
    expect(page.rows.some((t) => t.id === ticket.id)).toBe(true);

    const otherPage = await listCustomerTickets(otherCustomerId);
    expect(otherPage.rows.some((t) => t.id === ticket.id)).toBe(false);
  });
});

describe('yazışma ve durum', () => {
  it('müşteri kapanmış talebe yazarsa talep kendiliğinden yeniden açılır', async () => {
    const ticket = await openPlainTicket();
    await changeTicketStatus({ ticketId: ticket.id, to: 'resolved', by: 'staff' });
    expect((await tickets.getById(ticket.id))?.status).toBe('resolved');

    const reply = await replyAsCustomer({ customerId, ticketId: ticket.id, body: 'Sorun sürüyor.' });
    expect(reply.ok).toBe(true);

    const after = await tickets.getById(ticket.id);
    expect(after?.status).toBe('open');
    // Damga ile durum ayrışamaz.
    expect(after?.resolvedAt).toBeNull();
  });

  it('açık talepte müşterinin cevabı durumu başa sarmaz', async () => {
    const ticket = await openPlainTicket();
    await changeTicketStatus({ ticketId: ticket.id, to: 'in_progress', by: 'staff' });
    await replyAsCustomer({ customerId, ticketId: ticket.id, body: 'Bir ekleme yapayım.' });
    expect((await tickets.getById(ticket.id))?.status).toBe('in_progress');
  });

  it('personelin cevabı durumu kendiliğinden değiştirmez', async () => {
    const ticket = await openPlainTicket();
    const reply = await replyAsStaff({ ticketId: ticket.id, authorId: staffId, body: 'İnceliyoruz.' });
    expect(reply.ok).toBe(true);
    expect((await tickets.getById(ticket.id))?.status).toBe('open');

    const view = await getCustomerTicket('tr', customerId, ticket.id);
    // Personelin yazdığı müşteriye AYNEN görünür — iç not yoktur.
    expect(view?.messages.at(-1)).toMatchObject({ sender: 'admin', body: 'İnceliyoruz.' });
  });

  it('müşteri kendi talebini çözüldü yapamaz', async () => {
    const ticket = await openPlainTicket();
    const result = await changeTicketStatus({ ticketId: ticket.id, to: 'resolved', by: 'customer', customerId });
    expect(result).toEqual({ ok: false, reason: 'forbidden_for_actor' });
  });

  it('çözülen talep damgalanır, yeniden açılınca damga silinir', async () => {
    const ticket = await openPlainTicket();
    await changeTicketStatus({ ticketId: ticket.id, to: 'resolved', by: 'staff' });
    expect((await tickets.getById(ticket.id))?.resolvedAt).not.toBeNull();

    await changeTicketStatus({ ticketId: ticket.id, to: 'open', by: 'customer', customerId });
    expect((await tickets.getById(ticket.id))?.resolvedAt).toBeNull();
  });
});

describe('iade tetiği', () => {
  it('siparişsiz talepte tetiklenecek akış yoktur', async () => {
    const ticket = await openPlainTicket();
    const result: TicketWriteResult<Ticket> = await triggerReturnFromTicket(ticket.id);
    expect(result).toEqual({ ok: false, reason: 'no_order' });
  });
});

describe('diğer yüzeylerin okumaları', () => {
  it('sipariş detayı kendi talebini bulur, başkasınınkini bulmaz', async () => {
    // Siparişsiz talepte bağ yoktur — okuma yine de sahiplikle süzer.
    const ticket = await openPlainTicket();
    expect(await listTicketsForOrder(otherCustomerId, ticket.id)).toEqual([]);
  });

  it('dashboard rozeti kapanmamışları sayar', async () => {
    const before = await countOpenTickets();
    const ticket = await openPlainTicket();
    expect(await countOpenTickets()).toBe(before + 1);

    await changeTicketStatus({ ticketId: ticket.id, to: 'resolved', by: 'staff' });
    expect(await countOpenTickets()).toBe(before);
  });
});

describe('operasyon kuyruğu', () => {
  it('cevap bekleyen talep işaretlenir; personel yazınca işaret düşer', async () => {
    const ticket = await openPlainTicket('Kargo ne zaman çıkar?');

    const beforeReply = await listTicketQueue({ openOnly: true }, undefined, 100);
    expect(beforeReply.rows.find((r) => r.id === ticket.id)?.awaitingReply).toBe(true);

    await replyAsStaff({ ticketId: ticket.id, authorId: staffId, body: 'Yarın çıkıyor.' });
    const afterReply = await listTicketQueue({ openOnly: true }, undefined, 100);
    expect(afterReply.rows.find((r) => r.id === ticket.id)?.awaitingReply).toBe(false);
  });

  it('kuyruk satırı müşteri adını ve önizlemeyi tek turda taşır', async () => {
    const ticket = await openPlainTicket('Gözlemeler ezilmiş gelmiş.');
    const page = await listTicketQueue({ openOnly: true }, undefined, 100);
    const row = page.rows.find((r) => r.id === ticket.id);

    expect(row?.customerName).toBe('Ayşe Kaya');
    expect(row?.preview).toBe('Gözlemeler ezilmiş gelmiş.');
    expect(row?.returnBound).toBe(false); // tip 'question'
  });

  it('detay müşteri bağlamını taşır — sürekli şikâyet eden mi, ilk kez mi', async () => {
    const ticket = await openPlainTicket();
    const detail = await getStaffTicketDetail('tr', ticket.id);

    expect(detail?.customer.name).toBe('Ayşe Kaya');
    expect(detail?.customer.totalTickets).toBeGreaterThan(0);
    expect(detail?.returnTrigger).toEqual({ allowed: false, reason: 'no_order' });
    expect(detail?.allowedTransitions).toContain('resolved');
  });

  it('zaten insanda olan talep devralınmaz', async () => {
    const ticket = await openPlainTicket();
    expect(await takeOverTicket(ticket.id)).toEqual({ ok: false, reason: 'already_human' });
  });
});
