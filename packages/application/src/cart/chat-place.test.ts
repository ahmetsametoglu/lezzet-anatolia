import { afterAll, describe, expect, it } from 'vitest';
import { ConversationService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { chatPlaceMemory, resolveChatPlace } from './chat-place';

/**
 * SOHBETİN YERİ = KOD + ÜLKE (15.20 · kullanıcı kararı 10.09) — hafızanın GERÇEK yazımı.
 *
 * Araç dosyaları hafızayı taklit ediyor (aracın NE yazdırdığını sınar); burası yazımın kendisini sınar:
 * iki ülkeli kod ülkesiz saklanıyor mu, ülke gelince yanına yazılıyor mu, yeni kod eskisinin ülkesini
 * miras almıyor mu. Kodlar referans tablosunun verisi (0033 — seed değil): iki ülkeli `01640`, tek
 * ülkeli `75001`.
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
    const yer = await resolveChatPlace(db, { said: '01640', memory: chatPlaceMemory(db, konusma), addressCustomerId: null });
    expect(yer).toMatchObject({ kod: '01640', ulke: null, durum: 'belirsiz' });
    expect([...yer.adaylar].sort()).toEqual(['DE', 'FR']);
    // Kod sohbette: sonraki tur posta kodunu DEĞİL, yalnız ülkeyi sorar.
    expect(await conversations.getById(konusma.id)).toMatchObject({ postalCode: '01640', postalCountry: null });
  });

  it('ülke kod SÖYLENMEDEN gelir ve saklı koda eklenir — yer artık belirsiz değil', async () => {
    const konusma = await sohbetAc();
    const hafiza = chatPlaceMemory(db, konusma);
    await resolveChatPlace(db, { said: '01640', memory: hafiza, addressCustomerId: null });
    const yer = await resolveChatPlace(db, { saidCountry: 'DE', memory: hafiza, addressCustomerId: null });
    expect(yer).toMatchObject({ kod: '01640', ulke: 'DE' });
    expect(yer.durum).not.toBe('belirsiz');
    expect(await conversations.getById(konusma.id)).toMatchObject({ postalCode: '01640', postalCountry: 'DE' });
  });

  it('yeni tek ülkeli kod eskisinin ülkesini MİRAS ALMAZ — ülkesi koddan türer', async () => {
    const konusma = await sohbetAc();
    const hafiza = chatPlaceMemory(db, konusma);
    await resolveChatPlace(db, { said: '01640', saidCountry: 'DE', memory: hafiza, addressCustomerId: null });
    await resolveChatPlace(db, { said: '75001', memory: hafiza, addressCustomerId: null });
    expect(await conversations.getById(konusma.id)).toMatchObject({ postalCode: '75001', postalCountry: 'FR' });
  });
});
