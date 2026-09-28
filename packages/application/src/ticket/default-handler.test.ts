import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { TICKET_DEFAULT_HANDLER_FALLBACK, TICKET_DEFAULT_HANDLER_KEY } from '@lezzet/domain-core';
import { openTicket } from './staff-write';
import { openCustomerTicket } from './write';

// Açılış kapısı ayarı okumazsa talep kolon varsayılanıyla (`human`) doğar; iki kapı da ayrı ayrı sınanır.
const db = serviceDb();
const settings = new SettingsService(db);
const stamp = Date.now();
const profileIds: string[] = [];
let musteriId = '';
let onceki: unknown;

beforeAll(async () => {
  const musteri = await new UserProfileService(db).insert({ name: `Talep modu ${stamp}`, email: `talep-modu-${stamp}@example.test` });
  musteriId = musteri.id;
  profileIds.push(musteriId);
  // Ayar küresel tek satır: önce okunur, sonra geri konur.
  onceki = await settings.get<unknown>(TICKET_DEFAULT_HANDLER_KEY, null);
}, 60_000);

afterAll(async () => {
  await settings.set(TICKET_DEFAULT_HANDLER_KEY, onceki ?? TICKET_DEFAULT_HANDLER_FALLBACK);
  await purgeTestData(db, { profileIds });
});

describe('yeni talebin yürütücüsü ayardan', () => {
  it('personelin açtığı talep ayardaki modda doğar', async () => {
    await settings.set(TICKET_DEFAULT_HANDLER_KEY, 'ai');
    const result = await openTicket(db, { customerId: musteriId, source: 'form', type: 'question', body: `Soru ${stamp}-1` });
    if (!result.ok) throw new Error(`açılamadı: ${result.reason}`);
    expect(result.data.handledBy).toBe('ai');
  });

  it('müşterinin açtığı talep ayardaki modda doğar', async () => {
    await settings.set(TICKET_DEFAULT_HANDLER_KEY, 'ai');
    const outcome = await openCustomerTicket(db, { customerId: musteriId, source: 'form', type: 'question', body: `Soru ${stamp}-2` });
    if (outcome.status !== 'ok') throw new Error(`açılamadı: ${outcome.status}`);
    expect(outcome.ticket.handledBy).toBe('ai');
  });

  it('bozuk ayar değeri talebin fabrika değerine düşer', async () => {
    await settings.set(TICKET_DEFAULT_HANDLER_KEY, 'robot');
    const result = await openTicket(db, { customerId: musteriId, source: 'form', type: 'question', body: `Soru ${stamp}-3` });
    if (!result.ok) throw new Error(`açılamadı: ${result.reason}`);
    expect(result.data.handledBy).toBe(TICKET_DEFAULT_HANDLER_FALLBACK);
  });
});
