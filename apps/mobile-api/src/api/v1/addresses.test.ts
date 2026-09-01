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

/**
 * ── ÖNERİNİN KOORDİNATI (11.9 · 01.09) ──────────────────────────────────────
 * 01.09'a kadar bu uç noktayı hiç taşımıyordu: mobil müşteri BAN önerisine tıklıyor, koordinat o
 * cevapta geliyor ve ATILIYORDU. Adres noktasız doğuyor, tarama işi on dakika sonra AYNI soruyu
 * ikinci kez soruyordu — ve arada kalan pencerede o durak posta kodu merkezine düşüyordu.
 *
 * Burada sınanan şey TAŞIMA (dosyanın kendi ilkesi): gövdenin `point` alanı kapıya ayrı bir aday
 * olarak ulaşıyor mu, ve süzgeç çalışıyor mu. Süzgecin KURALI `geo-address.test.ts`in konusu.
 */
describe('öneri koordinatı', () => {
  const adresiOku = async (id: string) =>
    (await db.from('address').select('lat, lng, geo_precision, geo_source').eq('id', id).single()).data;

  /** Adres ekler ve KENDİ satırını döner — cevap güncel listedir, kayıt satırı değil. */
  async function ekle(body: Record<string, unknown>): Promise<string> {
    const list = await envelopeData<{ id: string; line1: string }[]>(
      await req('', { method: 'POST', body: JSON.stringify({ ...yeniAdres, ...body }) }),
    );
    const row = list.find((address) => address.line1 === body['line1']);
    if (!row) throw new Error(`fikstür: eklenen adres listede yok (${String(body['line1'])})`);
    return row.id;
  }

  it('MAKUL aday satıra iner — künyesiyle birlikte', async () => {
    const id = await ekle({ line1: '9 rue du Point', point: { lat: 48.5839, lng: 7.7455, precision: 'housenumber' } });

    const satir = await adresiOku(id);
    expect(Number(satir?.lat)).toBeCloseTo(48.5839, 4);
    expect(satir?.geo_precision).toBe('housenumber');
    // Kaynak `ban`: nokta bir öneriden geldi, elle girilmedi.
    expect(satir?.geo_source).toBe('ban');
  });

  it('UZAK aday yazılmaz ama KAYIT GEÇER — adres defteri hiçbir hâlde reddetmez', async () => {
    /* İki kural aynı anda: makullük süzgeci yanlış koordinatı tutar (Paris'in noktası 67000 için
       makul değil) VE müşterinin adresi yine kaydedilir. Süzgecin kaydı reddetmesi, bir koordinat
       yüzünden adres eklenememesi olurdu — koordinatsız adres bundan iyidir. */
    const id = await ekle({ line1: '11 rue du Uzak', point: { lat: 48.8566, lng: 2.3522, precision: 'housenumber' } });

    const satir = await adresiOku(id);
    expect(satir?.lat).toBeNull();
    expect(satir?.geo_source).toBeNull();
  });

  it('aday YOKSA satır noktasız doğar — tarama kuyruğuna girer', async () => {
    const id = await ekle({ line1: '13 rue du Elle' });

    expect((await adresiOku(id))?.lat).toBeNull();
  });

  it('HAM `lat` gövdeden SIZAMAZ — süzgeci atlayan ikinci yol yok', async () => {
    /* Sözleşme `lat`/`lng` taşımıyor ve Zod bilinmeyen anahtarı SOYUYOR; yani böyle bir gövde
       reddedilmez, alan sessizce düşer. Ölçülen şey tam olarak bu: kayıt geçer ama koordinat
       YAZILMAZ. Alan bir gün gövdeye eklenirse bu test kırmızıya döner ve sebebini söyler. */
    const id = await ekle({ line1: '15 rue du Ham', lat: 48.5839, lng: 7.7455 });

    expect((await adresiOku(id))?.lat).toBeNull();
  });

  it('DÜZENLEMEDE yeni öneri seçilirse nokta güncellenir', async () => {
    const id = await ekle({ line1: '17 rue du Duzen', point: { lat: 48.58, lng: 7.74, precision: 'street' } });

    const res = await req(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...yeniAdres,
        line1: '19 rue du Duzen',
        point: { lat: 48.59, lng: 7.75, precision: 'housenumber' },
      }),
    });
    expect(res.status).toBe(200);

    const satir = await adresiOku(id);
    expect(Number(satir?.lat)).toBeCloseTo(48.59, 4);
    expect(satir?.geo_precision).toBe('housenumber');
  });

  it('DÜZENLEMEDE aday yoksa ve adres değiştiyse nokta DÜŞER', async () => {
    // Kuralın kendisi `geo-address`te; buradaki iddia taşımanın onu BOZMADIĞI — `point`
    // gönderilmediğinde kapı düşürme dalını görmeli.
    const id = await ekle({ line1: '21 rue du Dus', point: { lat: 48.58, lng: 7.74, precision: 'street' } });
    expect((await adresiOku(id))?.lat).not.toBeNull();

    const res = await req(`/${id}`, { method: 'PATCH', body: JSON.stringify({ ...yeniAdres, line1: '23 rue du Dus' }) });
    expect(res.status).toBe(200);

    expect((await adresiOku(id))?.lat).toBeNull();
  });
});
