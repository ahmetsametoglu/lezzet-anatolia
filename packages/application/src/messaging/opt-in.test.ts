import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { recordConversationOptIn } from './opt-in';

/**
 * SOHBETTE VERİLEN İZNİN ÇİFT YAZIMI (15.12 · DOMAIN §11 · test dalgası 15.18).
 *
 * ── ASIL KORUNAN DAL BİR YOKLUK ─────────────────────────────────────────────
 * Messenger/Instagram izni müşteri KARTINA yazılmaz. `marketing_consent` bugün yalnız `email` ve
 * `whatsapp` anahtarlarını taşıyor; olmayan bir kanalı karta yazmak, dayanağı olmayan bir izin
 * kaydı üretmekti — ve kampanya gönderimi bir gün o kayda bakacak. Sohbetin kendi izni ise HER
 * kanalda yazılır: izin bir kanıttır ve sohbette verilmiştir.
 *
 * Yani bu dosyanın en değerli iddiası "yazıldı mı" değil, **"yazılmadı mı"**.
 */
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

/**
 * Müşterinin kartındaki WhatsApp izni.
 *
 * Kayıt bir BAYRAK DEĞİL, KANIT (ölçüldü 24.08 — ilk yazımda `boolean` sanmıştım): `{ granted,
 * at, source }`. Üçü birlikte durmak zorunda; "izin var" demek ne zaman ve nereden verildiği
 * yazılmadan GDPR'da bir şey ifade etmez. `undefined` = kanal kartta HİÇ yok.
 */
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
    // İzin bir KANITTIR: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir şey ifade etmez.
    expect(guncel?.optInAt).not.toBeNull();

    const kart = await karttakiIzin(musteriId);
    expect(kart?.granted).toBe(true);
    // KAYNAK da yazılır ve operatöre ham hâliyle görünür: hesap sayfasından verilen izinle
    // sohbette verilen izin ayırt edilebilmeli ("12.03.2026 · whatsapp").
    expect(kart?.source).toBe('whatsapp');
    expect(kart?.at).toBeTruthy();
  });

  it('KİMLİKSİZ WhatsApp sohbetinde izin yine yazılır — kimlik sonra bağlanınca kaybolmasın', async () => {
    // Kimliksizlik tasarımın bir hâli (webhook önce yazar, kimliği sonra çözer). İzni "müşteri
    // kaydı yok" diye atmak, müşterinin az önce söylediği şeyi çöpe atmaktı.
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
    // Ret de bir KAYITTIR: kaydı silmek "hiç sorulmadı" demek olurdu ve ikisi ayrı şeydir.
    const kart = await karttakiIzin(musteriId);
    expect(kart?.granted).toBe(false);
    expect(kart?.at).toBeTruthy();
  });
});

describe('Messenger/Instagram izni MÜŞTERİ KARTINA yazılmaz', () => {
  it('Messenger: sohbete yazılır, karta YAZILMAZ', async () => {
    // Kartta `messenger` diye bir anahtar yok; `whatsapp` anahtarına yazmak ise düpedüz yanlış
    // kanalın iznini uydurmak olurdu — kampanya gönderimi bir gün o satıra bakacak.
    const temiz = await profiles.insert({ name: `İzin messenger ${stamp}`, email: `izin-fb-${stamp}@example.test` });
    profileIds.push(temiz.id);

    const konusma = await sohbetAc('messenger', temiz.id);
    const sonuc = await recordConversationOptIn(db, { conversationId: konusma.id, granted: true });
    expect(sonuc).toEqual({ status: 'recorded', profileUpdated: false });

    expect((await conversations.getById(konusma.id))?.optIn).toBe(true);
    // Kart HİÇ dokunulmamış olmalı: `false` bile değil, YOK.
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
