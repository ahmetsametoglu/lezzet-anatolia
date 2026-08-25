import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AddressService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/**
 * ADRESLER — `/api/v1/me/addresses`, beş uç.
 *
 * ── ÇİVİLENEN ASIL KARAR: SAHİPLİK JETONDAN, YOLDAN DEĞİL ───────────────────
 * Adres kimliği URL'de dolaşıyor (`PATCH /:id`, `DELETE /:id`, `POST /:id/default`) ve uuid tahmin
 * edilemez — ama **tahmin edilemezlik bir yetki denetimi değildir**. Kimlik bir kez sızarsa
 * (log, ekran görüntüsü, paylaşılan cihaz) daraltma yoksa başkasının adresi düzenlenebilir ya da
 * silinebilir. Ve sızıntı olmasa bile kural, "kimin verisi" sorusunu URL'e devretmiş olur.
 *
 * Kurallar `@lezzet/application`ın kendi kapılarında (`addresses.test.ts` orada); burada sınanan
 * TAŞIMA: kimliğin jetondan çözülmesi ve BAŞKASININ satırına dokunulamaması.
 *
 * ── VE BİR VERİ BÜTÜNLÜĞÜ KARARI ────────────────────────────────────────────
 * Cevap her yazımdan sonra GÜNCEL LİSTEYİ döndürüyor (uçların ortak sözleşmesi): tek kaydı dönmek
 * istemciyi ikinci bir okuma turuna mecbur bırakır ve iki cevap arasında ayrışma riski doğar.
 */
const db = serviceDb();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let benimToken: string;
let otekiAdresId: string;

const yeniAdres = {
  recipient: 'Test Alıcı',
  phone: '+33600000000',
  line1: '1 rue du Test',
  postalCode: '67000',
  city: 'Strasbourg',
};

function req(path: string, init: RequestInit = {}) {
  return app.request(`/api/v1/me/addresses${path}`, {
    ...init,
    headers: { ...bearer(benimToken), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

beforeAll(async () => {
  const benim = await createSignedInUser({ prefix: 'addr-api', label: 'benim' });
  const oteki = await createSignedInUser({ prefix: 'addr-api', label: 'oteki' });
  benimToken = benim.token;
  authUserIds.push(benim.authUserId, oteki.authUserId);
  profileIds.push(benim.profileId, oteki.profileId);

  // ÖTEKİ müşterinin adresi — sahiplik iddiası ancak gerçekten var olan ama dokunulmaması
  // gereken bir satırla sınanabilir.
  otekiAdresId = (await new AddressService(db).insert({
    customerId: oteki.profileId,
    recipient: 'Öteki Alıcı',
    phone: '+33611111111',
    line1: '9 rue Ailleurs',
    postalCode: '68000',
    city: 'Colmar',
  })).id;
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('kapı', () => {
  it.each([
    ['GET /', 'GET', ''],
    ['POST /', 'POST', ''],
  ])('%s Bearer olmadan 401', async (_ad, method, path) => {
    const res = await app.request(`/api/v1/me/addresses${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(yeniAdres) : undefined,
    });

    expect(res.status).toBe(401);
  });
});

describe('okuma ve yazma', () => {
  it('BAŞKASININ adresi listede GÖRÜNMEZ', async () => {
    const list = await envelopeData<{ id: string }[]>(await req(''));

    expect(list.map((a) => a.id)).not.toContain(otekiAdresId);
  });

  it('adres eklenir ve cevap GÜNCEL LİSTEYİ döndürür', async () => {
    // Tek kaydı dönmek istemciyi ikinci bir okuma turuna mecbur bırakır ve iki cevap arasında
    // ayrışma riski doğurur (adres ailesinin ortak kararı).
    const list = await envelopeData<{ id: string; recipient: string }[]>(
      await req('', { method: 'POST', body: JSON.stringify(yeniAdres) }),
    );

    expect(Array.isArray(list)).toBe(true);
    expect(list.some((a) => a.recipient === 'Test Alıcı')).toBe(true);
  });

  it('BOZUK gövde 400 `invalid_body`', async () => {
    const res = await req('', { method: 'POST', body: JSON.stringify({ recipient: 'Yalnız ad' }) });

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_body');
  });
});

describe('sahiplik — başkasının satırına dokunulamaz', () => {
  it('BAŞKASININ adresi DÜZENLENEMEZ', async () => {
    /* Bu dosyanın asıl iddiası. Kimlik URL'de; tahmin edilemezliği bir yetki denetimi DEĞİLDİR.
       Daraltma düşerse burası 200 döner ve o an başkasının teslimat adresi değiştirilebilir —
       kargo başka kapıya gider ve kimse nedenini anlamaz. */
    const res = await req(`/${otekiAdresId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...yeniAdres, recipient: 'Ele geçirildi' }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // Ve satır GERÇEKTEN değişmemiş olmalı — durum kodu tek başına yetmez.
    const { data } = await db.from('address').select('recipient').eq('id', otekiAdresId).single();
    expect(data?.recipient).toBe('Öteki Alıcı');
  });

  it('BAŞKASININ adresi SİLİNEMEZ', async () => {
    const res = await req(`/${otekiAdresId}`, { method: 'DELETE' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    const { count } = await db.from('address').select('id', { count: 'exact', head: true }).eq('id', otekiAdresId);
    expect(count).toBe(1);
  });

  it('BAŞKASININ adresi VARSAYILAN yapılamaz', async () => {
    const res = await req(`/${otekiAdresId}/default`, { method: 'POST' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('OLMAYAN adres kimliği de reddedilir — 200 dönmez', async () => {
    const res = await req('/00000000-0000-4000-9000-000000000000', { method: 'DELETE' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
