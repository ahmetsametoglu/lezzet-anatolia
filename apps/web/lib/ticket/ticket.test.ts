import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderItemService, OrderService, ProductService, TicketService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { r2Keys } from '@lezzet/storage';
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
const createdOrders: string[] = [];
let customerId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let otherCustomerId: string;
let staffId: string;
let categoryId: string;
let productId: string;
/** Müşterinin kendi siparişi + ona ait bir kalem. */
let orderId: string;
let orderItemId: string;
/** BAŞKA müşterinin siparişi — sahiplik kontrolünün asıl sınandığı yer. */
let otherOrderId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const customer = await profiles.insert({ name: 'Ayşe Kaya', email: `talep-${stamp}@example.test` });
  const other = await profiles.insert({ name: 'Marc Dubois', email: `talep-other-${stamp}@example.test` });
  const staff = await profiles.insert({ name: 'Depo Sorumlusu', email: `talep-staff-${stamp}@example.test` });
  customerId = customer.id;
  otherCustomerId = other.id;
  staffId = staff.id;
  createdProfiles.push(customer.id, other.id, staff.id);

  categoryId = (await new CategoryService(db).create({ name: { tr: `Talep testi ${stamp}` } })).id;
  const created = await new ProductService(db).create({
    name: { tr: `Talep ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  const variantId = created.variants[0]!.id;

  const orders = new OrderService(db);
  const line = { variantId, qty: 1, unitPrice: 12, vatRate: 5.5 };
  const mine = await orders.create(
    { warehouseId, customerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', total: 12 },
    [line],
  );
  orderId = mine.order.id;
  orderItemId = (await new OrderItemService(db).listByOrder(orderId))[0]!.id;

  const theirs = await orders.create(
    { warehouseId, customerId: otherCustomerId, channel: 'b2c', orderSource: 'web', deliveryType: 'shipping', status: 'confirmed', total: 12 },
    [line],
  );
  otherOrderId = theirs.order.id;
  createdOrders.push(orderId, otherOrderId);
});

afterAll(async () => {
  for (const id of createdTickets) await db.from('ticket').delete().eq('id', id);
  for (const id of createdOrders) await db.from('order').delete().eq('id', id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: createdProfiles });
  await db.from('warehouse').delete().eq('id', warehouseId);
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

/**
 * Talep açarken siparişe ve eke bağlanma, çağıranın KENDİ alanıyla sınırlıdır.
 *
 * Bu kontroller ne DB'de ne motorda olabilir: motor siparişleri görmez, DB'de `ticket.customer_id`
 * ↔ `order.customer_id` kısıtı yoktur (olsaydı personelin müşteri adına açtığı talep kırılırdı).
 */
describe('yabancı sipariş ve ek bağlanamaz', () => {
  it('başkasının siparişine talep açılamaz — sipariş referansı ve iade tutarı sızardı', async () => {
    const result = await openTicket({ customerId, source: 'order', type: 'missing', body: 'Eksik geldi', orderId: otherOrderId });
    // "Yok" ile "senin değil" aynı cevabı verir: olmayan bir siparişin varlığı doğrulanmaz.
    expect(result).toEqual({ ok: false, reason: 'order_not_found' });
  });

  it('kendi siparişine açılabilir ve kalem işaretlenebilir', async () => {
    const result = await openTicket({
      customerId,
      source: 'order',
      type: 'missing',
      body: 'Bir kalem eksik geldi',
      orderId,
      orderItemIds: [orderItemId],
    });
    if (!result.ok) throw new Error(result.reason);
    createdTickets.push(result.data.id);
    expect(result.data.orderItemIds).toEqual([orderItemId]);
  });

  it('o siparişe ait olmayan kalem işaretlenemez — sessizce yutulmaz', async () => {
    const result = await openTicket({
      customerId,
      source: 'order',
      type: 'missing',
      body: 'Eksik geldi',
      orderId,
      orderItemIds: ['00000000-0000-0000-0000-000000000009'],
    });
    expect(result).toEqual({ ok: false, reason: 'items_not_in_order' });
  });

  it('başkasının klasöründeki ek iliştirilemez — imzalı adres yanlış nesneye açılırdı', async () => {
    const foreign = r2Keys.ticketDraftAttachment(otherCustomerId, 'tok', 'bozuk.jpg');
    const result = await openTicket({ customerId, source: 'form', type: 'damaged', body: 'Ezilmiş', attachments: [foreign] });
    expect(result).toEqual({ ok: false, reason: 'attachment_not_yours' });
  });

  it('kendi taslak klasöründeki ek kabul edilir', async () => {
    const own = r2Keys.ticketDraftAttachment(customerId, 'tok', 'bozuk.jpg');
    const result = await openTicket({ customerId, source: 'form', type: 'damaged', body: 'Ezilmiş', attachments: [own] });
    if (!result.ok) throw new Error(result.reason);
    createdTickets.push(result.data.id);
  });

  it('cevaba iliştirilen ek O talebin klasöründen olmalı', async () => {
    const ticket = await openPlainTicket();
    const otherTicketKey = r2Keys.ticketAttachment('11111111-1111-1111-1111-111111111111', 'tok', 'foto.jpg');

    expect(await replyAsCustomer({ customerId, ticketId: ticket.id, body: 'Foto ekledim', attachments: [otherTicketKey] })).toEqual({
      ok: false,
      reason: 'attachment_not_yours',
    });
    const ok = await replyAsCustomer({
      customerId,
      ticketId: ticket.id,
      body: 'Foto ekledim',
      attachments: [r2Keys.ticketAttachment(ticket.id, 'tok', 'foto.jpg')],
    });
    expect(ok.ok).toBe(true);
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
    const result = await openTicket({ customerId, source: 'order', type: 'question', body: 'Bu sipariş ne zaman gelir?', orderId });
    if (!result.ok) throw new Error(result.reason);
    createdTickets.push(result.data.id);

    // Testin iki yarısı da gerçek: sahibi görür…
    expect((await listTicketsForOrder(customerId, orderId)).map((t) => t.id)).toContain(result.data.id);
    // …yabancı göremez. (Önceki hâli `orderId` yerine talep kimliği geçiyordu: sorgu zaten boş
    // dönerdi, sahiplik süzgeci silinse bile test geçerdi.)
    expect(await listTicketsForOrder(otherCustomerId, orderId)).toEqual([]);
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
