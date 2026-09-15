import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordConversationOptIn } from './opt-in';

// Asıl korunan dal bir yokluk: Messenger/Instagram izni müşteri kartına yazılmaz, sohbetin kendi izni ise her kanalda yazılır.
const db = serviceDb();
const conversations = new ConversationService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const conversationIds: string[] = [];
let musteriId = '';

let sira = 0;
async function sohbetAc(source: 'whatsapp' | 'messenger' | 'instagram', customerId: string | null) {
  sira += 1;
  const konusma = await conversations.open({
    source,
    externalRef: source === 'whatsapp' ? `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}` : `PSID-IZIN-${stamp}-${sira}`,
    customerId,
    providerAccountRef: null,
    profileName: null,
  });
  conversationIds.push(konusma.id);
  return konusma;
}

/** Kayıt bayrak değil kanıttır (`{ granted, at, source }`); `undefined` = kanal kartta hiç yok. */
async function karttakiIzin(profileId: string): Promise<{ granted: boolean; at: string; source: string } | undefined> {
  const profile = await profiles.getById(profileId);
  return (profile?.marketingConsent as { whatsapp?: { granted: boolean; at: string; source: string } } | null)?.whatsapp;
}

beforeAll(async () => {
  const musteri = await profiles.insert({ name: `İzin müşterisi ${stamp}`, email: `izin-${stamp}@example.test` });
  musteriId = musteri.id;
  profileIds.push(musteriId);
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds });
});

describe('sohbetin izni HER kanalda yazılır', () => {
  it('WhatsApp: sohbete de KARTA da yazılır', async () => {
    const konusma = await sohbetAc('whatsapp', musteriId);
    const sonuc = await recordConversationOptIn(db, { conversationId: konusma.id, granted: true });
    expect(sonuc).toEqual({ status: 'recorded', profileUpdated: true });

    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.optIn).toBe(true);
    // İzin bir kanıttır: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir şey ifade etmez.
    expect(guncel?.optInAt).not.toBeNull();

    const kart = await karttakiIzin(musteriId);
    expect(kart?.granted).toBe(true);
    // Kaynak da yazılır: hesap sayfasından verilen izinle sohbette verilen ayırt edilebilmeli.
    expect(kart?.source).toBe('whatsapp');
    expect(kart?.at).toBeTruthy();
  });

  it('KİMLİKSİZ WhatsApp sohbetinde izin yine yazılır — kimlik sonra bağlanınca kaybolmasın', async () => {
    // İzni "müşteri kaydı yok" diye atmak, müşterinin az önce söylediğini çöpe atmaktı.
    const konusma = await sohbetAc('whatsapp', null);
    const sonuc = await recordConversationOptIn(db, { conversationId: konusma.id, granted: true });
    expect(sonuc).toEqual({ status: 'recorded', profileUpdated: false });
    expect((await conversations.getById(konusma.id))?.optIn).toBe(true);
  });

  it('izin GERİ ALINABİLİR — `false` yazılır ve karta da yansır', async () => {
    const konusma = await sohbetAc('whatsapp', musteriId);
    await recordConversationOptIn(db, { conversationId: konusma.id, granted: true });
    const sonuc = await recordConversationOptIn(db, { conversationId: konusma.id, granted: false });
    expect(sonuc.status).toBe('recorded');

    expect((await conversations.getById(konusma.id))?.optIn).toBe(false);
    // Ret de bir kayıttır: kaydı silmek "hiç sorulmadı" demek olurdu.
    const kart = await karttakiIzin(musteriId);
    expect(kart?.granted).toBe(false);
    expect(kart?.at).toBeTruthy();
  });
});

describe('Messenger/Instagram izni MÜŞTERİ KARTINA yazılmaz', () => {
  it('Messenger: sohbete yazılır, karta YAZILMAZ', async () => {
    // Kartta `messenger` anahtarı yok; `whatsapp` anahtarına yazmak yanlış kanalın iznini uydurmak olurdu.
    const temiz = await profiles.insert({ name: `İzin messenger ${stamp}`, email: `izin-fb-${stamp}@example.test` });
    profileIds.push(temiz.id);

    const konusma = await sohbetAc('messenger', temiz.id);
    const sonuc = await recordConversationOptIn(db, { conversationId: konusma.id, granted: true });
    expect(sonuc).toEqual({ status: 'recorded', profileUpdated: false });

    expect((await conversations.getById(konusma.id))?.optIn).toBe(true);
    // Karta hiç dokunulmamış olmalı: `false` bile değil, yok.
    expect(await karttakiIzin(temiz.id)).toBeUndefined();
  });

  it('Instagram: aynı kural — kanal başına ayrı değil, kartta karşılığı YOK', async () => {
    const temiz = await profiles.insert({ name: `İzin instagram ${stamp}`, email: `izin-ig-${stamp}@example.test` });
    profileIds.push(temiz.id);

    const konusma = await sohbetAc('instagram', temiz.id);
    const sonuc = await recordConversationOptIn(db, { conversationId: konusma.id, granted: true });
    expect(sonuc).toEqual({ status: 'recorded', profileUpdated: false });
    expect(await karttakiIzin(temiz.id)).toBeUndefined();
  });
});

describe('olmayan sohbet', () => {
  it('`conversation_not_found` döner — sessizce "kaydedildi" denmez', async () => {
    const sonuc = await recordConversationOptIn(db, {
      conversationId: '00000000-0000-4000-8000-0000000000dd',
      granted: true,
    });
    expect(sonuc).toEqual({ status: 'refused', reason: 'conversation_not_found' });
  });
});
