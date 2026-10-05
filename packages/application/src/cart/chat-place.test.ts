import { afterAll, describe, expect, it } from 'vitest';
import { ConversationService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { chatPlaceMemory, resolveChatPlace } from './chat-place';

/**
 * Sohbetin yeri kod ve ülkedir; burası hafızanın gerçek yazımını sınar: iki ülkeli kod ülkesiz saklanır, ülke gelince yanına
 * yazılır, yeni kod eskisinin ülkesini miras almaz. Kodlar referans tablosunun verisidir: iki ülkeli `01640`, tek ülkeli `75001`.
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const stamp = Date.now();
const conversationIds: string[] = [];

async function sohbetAc() {
  const konusma = await conversations.open({ source: 'messenger', externalRef: `chat-place-${stamp}-${conversationIds.length}` });
  conversationIds.push(konusma.id);
  return konusma;
}

afterAll(async () => {
  await purgeTestData(db, { conversationIds });
});

describe('sohbetin yeri — kod + ülke (15.20)', () => {
  it('iki ülkeli kod ÜLKESİZ saklanır, yer "belirsiz" okunur ve seçenekler iki ülke', async () => {
    const konusma = await sohbetAc();
    const yer = await resolveChatPlace(db, {
      said: '01640',
      memory: chatPlaceMemory(db, konusma),
      addressCustomerId: null,
      business: 'lezzet',
    });
    expect(yer).toMatchObject({ kod: '01640', ulke: null, durum: 'belirsiz' });
    expect([...yer.adaylar].sort()).toEqual(['DE', 'FR']);
    // Kod sohbette: sonraki tur posta kodunu DEĞİL, yalnız ülkeyi sorar.
    expect(await conversations.getById(konusma.id)).toMatchObject({ postalCode: '01640', postalCountry: null });
  });

  it('ülke kod SÖYLENMEDEN gelir ve saklı koda eklenir — yer artık belirsiz değil', async () => {
    const konusma = await sohbetAc();
    const hafiza = chatPlaceMemory(db, konusma);
    await resolveChatPlace(db, { said: '01640', memory: hafiza, addressCustomerId: null, business: 'lezzet' });
    const yer = await resolveChatPlace(db, { saidCountry: 'DE', memory: hafiza, addressCustomerId: null, business: 'lezzet' });
    expect(yer).toMatchObject({ kod: '01640', ulke: 'DE' });
    expect(yer.durum).not.toBe('belirsiz');
    expect(await conversations.getById(konusma.id)).toMatchObject({ postalCode: '01640', postalCountry: 'DE' });
  });

  it('yeni tek ülkeli kod eskisinin ülkesini MİRAS ALMAZ — ülkesi koddan türer', async () => {
    const konusma = await sohbetAc();
    const hafiza = chatPlaceMemory(db, konusma);
    await resolveChatPlace(db, { said: '01640', saidCountry: 'DE', memory: hafiza, addressCustomerId: null, business: 'lezzet' });
    await resolveChatPlace(db, { said: '75001', memory: hafiza, addressCustomerId: null, business: 'lezzet' });
    expect(await conversations.getById(konusma.id)).toMatchObject({ postalCode: '75001', postalCountry: 'FR' });
  });
});
