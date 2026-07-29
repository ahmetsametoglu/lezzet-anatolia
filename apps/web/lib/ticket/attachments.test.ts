import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { requestTicketUploadUrl } from './attachments';
import { openTicket } from './write';

/**
 * Şikâyet fotoğrafının yükleme kapısı (16.2).
 *
 * Sınanan dört kural: **anahtarı kapı seçer** (istemci değil), **başkasının talebine yüklenemez**,
 * **yalnız görsel kabul edilir**, **tavan var**.
 *
 * Kovanın kendisi yerelde yapılandırılmamış olabilir; o zaman kapı `storage_unavailable` döner ve
 * testler yalnız KARAR yolunu sınar — imzanın kendisi `packages/storage` testinin işi.
 */
const db = serviceDb();
const stamp = Date.now();
const createdProfiles: string[] = [];
const createdTickets: string[] = [];
let customerId: string;
let otherCustomerId: string;
let ticketId: string;

beforeAll(async () => {
  const profiles = new UserProfileService(db);
  customerId = (await profiles.insert({ name: 'Ayşe Kaya', email: `ek-${stamp}@example.test` })).id;
  otherCustomerId = (await profiles.insert({ name: 'Marc Dubois', email: `ek-other-${stamp}@example.test` })).id;
  createdProfiles.push(customerId, otherCustomerId);

  const opened = await openTicket({ customerId, source: 'form', type: 'damaged', body: 'Ezilmiş geldi' });
  if (!opened.ok) throw new Error(opened.reason);
  ticketId = opened.data.id;
  createdTickets.push(ticketId);
});

afterAll(async () => {
  for (const id of createdTickets) await db.from('ticket').delete().eq('id', id);
  await purgeTestData(db, { profileIds: createdProfiles });
});

/** Kova yapılandırılmamışsa karar doğru olsa da adres üretilemez; ikisini de kabul ederiz. */
function decided(result: Awaited<ReturnType<typeof requestTicketUploadUrl>>) {
  return result.ok || result.reason === 'storage_unavailable';
}

describe('yükleme izni', () => {
  it('talep kimliği verilmezse anahtar MÜŞTERİNİN taslak klasörüne kurulur', async () => {
    const result = await requestTicketUploadUrl({ customerId, filename: 'bozuk.jpg' });
    expect(decided(result)).toBe(true);
    if (!result.ok) return;

    // Anahtarı kapı kurar: istemciden gelen bir yol doğrulanmak zorunda kalmasın.
    expect(result.key).toMatch(new RegExp(`^support/tickets/drafts/${customerId}/[^/]+\\.jpg$`));
  });

  it('var olan talebe yüklenen ek O talebin klasörüne gider', async () => {
    const result = await requestTicketUploadUrl({ customerId, ticketId, filename: 'ikinci-aci.png' });
    expect(decided(result)).toBe(true);
    if (!result.ok) return;
    expect(result.key).toMatch(new RegExp(`^support/tickets/${ticketId}/[^/]+\\.png$`));
  });

  it('başkasının talebine yüklenemez', async () => {
    expect(await requestTicketUploadUrl({ customerId: otherCustomerId, ticketId, filename: 'bozuk.jpg' })).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });

  it('görsel olmayan dosya kabul edilmez — private kova dosya paylaşım alanı değil', async () => {
    for (const filename of ['fatura.pdf', 'arsiv.zip', 'not.txt', 'uzantisiz']) {
      expect(await requestTicketUploadUrl({ customerId, filename })).toEqual({ ok: false, reason: 'unsupported_type' });
    }
  });

  it('iPhone varsayılanı HEIC kabul edilir — müşteri dönüştürmekle uğraşmamalı', async () => {
    expect(decided(await requestTicketUploadUrl({ customerId, filename: 'IMG_0421.HEIC' }))).toBe(true);
  });

  it('ek sayısında tavan var', async () => {
    expect(await requestTicketUploadUrl({ customerId, filename: 'altinci.jpg', alreadyRequested: 5 })).toEqual({
      ok: false,
      reason: 'too_many',
    });
  });

  it('her istek AYRI anahtar üretir — ikinci açı birincinin üzerine yazmaz', async () => {
    const first = await requestTicketUploadUrl({ customerId, ticketId, filename: 'aci.jpg' });
    const second = await requestTicketUploadUrl({ customerId, ticketId, filename: 'aci.jpg' });
    if (!first.ok || !second.ok) return; // kova yok — bu testin konusu değil
    expect(first.key).not.toBe(second.key);
  });
});

describe('kapının verdiği anahtar talebe iliştirilebilir', () => {
  it('taslak anahtarı openTicket tarafından kabul edilir', async () => {
    const issued = await requestTicketUploadUrl({ customerId, filename: 'kanit.jpg' });
    if (!issued.ok) return;

    const opened = await openTicket({
      customerId,
      source: 'form',
      type: 'damaged',
      body: 'Fotoğrafı ekte',
      attachments: [issued.key],
    });
    expect(opened.ok).toBe(true);
    if (opened.ok) createdTickets.push(opened.data.id);
  });
});
