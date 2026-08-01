import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TicketService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { notifyTicketReceived, notifyTicketReplied, notifyTicketStatusChanged } from './notify';
import { changeTicketStatus, openTicket, replyAsCustomer, replyAsStaff } from './write';

/**
 * Talep bildirimlerinin tetiklenmesi (16.4).
 *
 * Sınanan beş kural: **talebin açılışı teyit doğurur**, **personelin cevabı haber doğurur**,
 * **müşterinin kendi mesajı doğurmaz**, **`in_progress` doğurmaz**, **bildirim asıl işlemi
 * durdurmaz**.
 *
 * Sağlayıcı anahtarı yerelde yok; sürücü `skipped` döner. Sınanan şey gönderimin kendisi değil —
 * **hangi olayın haber sayıldığı**. Gönderim `packages/notify` testinin işi.
 */
const db = serviceDb();
const tickets = new TicketService(db);
const stamp = Date.now();
const createdProfiles: string[] = [];
const createdTickets: string[] = [];
let customerId: string;
let staffId: string;

async function newTicket() {
  const opened = await openTicket({ customerId, source: 'form', type: 'question', body: 'Teslimat bölgeniz nereye kadar?' });
  if (!opened.ok) throw new Error(opened.reason);
  createdTickets.push(opened.data.id);
  return opened.data;
}

beforeAll(async () => {
  const profiles = new UserProfileService(db);
  customerId = (await profiles.insert({ name: 'Ayşe Kaya', email: `bildirim-${stamp}@example.test`, preferredLanguage: 'fr' })).id;
  staffId = (await profiles.insert({ name: 'Destek', email: `bildirim-staff-${stamp}@example.test` })).id;
  createdProfiles.push(customerId, staffId);
});

afterAll(async () => {
  for (const id of createdTickets) await db.from('ticket').delete().eq('id', id);
  await purgeTestData(db, { profileIds: createdProfiles });
});

describe('hangi olay haber sayılır', () => {
  it('müşterinin kendi açtığı talep TEYİT doğurur — ekran iki mail vaat ediyor', async () => {
    const ticket = await newTicket();

    // Kuralın ("kendi cümleni mailde okumak istemezsin") istisnası: teyidin işi anlatmak değil,
    // mesajın ulaştığını kanıtlamak.
    expect((await notifyTicketReceived(ticket, 'customer'))[0]?.channel).toBe('email');
  });

  it('personelin müşteri adına açtığı talep teyit DOĞURMAZ', async () => {
    const ticket = await newTicket();

    // Orada ilk sözü operatör söyler; "bize yazdıklarınız" başlığı altında müşteriye kendi
    // yazmadığı bir metni göstermek olurdu.
    expect(await notifyTicketReceived(ticket, 'staff')).toEqual([]);
  });

  it('personelin cevabı müşteriye haber doğurur', async () => {
    const ticket = await newTicket();
    await replyAsStaff({ ticketId: ticket.id, authorId: staffId, body: 'Strasbourg ve 20 km çevresi.' });

    const results = await notifyTicketReplied((await tickets.getById(ticket.id))!);
    // E-postası olan müşteriye mail sürücüsü bakar; yerelde anahtar yok → `skipped`, hata DEĞİL.
    expect(results[0]?.channel).toBe('email');
  });

  it('çözüldü ve yeniden açıldı haber doğurur', async () => {
    const ticket = await newTicket();
    const resolved = (await changeTicketStatus({ ticketId: ticket.id, to: 'resolved', by: 'staff' })) as { ok: true; data: typeof ticket };

    expect(await notifyTicketStatusChanged(resolved.data, 'open', 'staff')).toHaveLength(1);
    expect(await notifyTicketStatusChanged({ ...resolved.data, status: 'open' }, 'resolved', 'staff')).toHaveLength(1);
  });

  it('`in_progress` haber DOĞURMAZ — "incelemeye aldık" bir şey söylemez', async () => {
    const ticket = await newTicket();
    expect(await notifyTicketStatusChanged({ ...ticket, status: 'in_progress' }, 'open', 'staff')).toEqual([]);
  });

  it('müşterinin kendi yeniden açması ona mail göndermez', async () => {
    const ticket = await newTicket();
    // Kendi eyleminin haberini almak gürültüdür.
    expect(await notifyTicketStatusChanged({ ...ticket, status: 'open' }, 'resolved', 'customer')).toEqual([]);
  });
});

describe('bildirim asıl işlemi durdurmaz', () => {
  it('e-postası olmayan müşteriye cevap yine yazılır', async () => {
    // Telefon tekil: damgayla benzersiz bir numara kur.
    const phone = `+3361${String(stamp).slice(-7)}`;
    const phoneOnly = (await new UserProfileService(db).insert({ name: 'Telefonla', phone })).id;
    createdProfiles.push(phoneOnly);
    const opened = await openTicket({ customerId: phoneOnly, source: 'form', type: 'other', body: 'Merhaba' });
    if (!opened.ok) throw new Error(opened.reason);
    createdTickets.push(opened.data.id);

    const replied = await replyAsStaff({ ticketId: opened.data.id, authorId: staffId, body: 'Merhaba, buyurun.' });
    expect(replied.ok).toBe(true);
    // Mesaj gerçekten yazıldı: haber gitmese de yazışma durur.
    expect((await tickets.getById(opened.data.id))?.status).toBeDefined();
  });

  it('müşterinin kendi cevabı akışı bozmaz', async () => {
    const ticket = await newTicket();
    expect((await replyAsCustomer({ customerId, ticketId: ticket.id, body: 'Teşekkürler' })).ok).toBe(true);
  });
});
