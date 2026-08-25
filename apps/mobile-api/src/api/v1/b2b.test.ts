import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/**
 * TOPTAN BAŞVURUSU — `/api/v1/me/b2b`, iki korumalı uç (21.31).
 *
 * ── AÇIK YARI BİLEREK SINANMIYOR ────────────────────────────────────────────
 * `GET /b2b/company/:siret` ve `/b2b/vat/:number` DIŞ SERVİSE çıkıyor (resmî kayıt sorgusu, AB KDV
 * doğrulaması). Onları testten çağırmak, ağ erişimini ve üçüncü tarafın çalışma süresini bu
 * paketin içine sokardı — koşu bir gün onların arızasıyla kırmızıya döner ve kimse sebebi bizde
 * aramaz. Kapılarının AÇIK olduğu zaten `router.test.ts`te çivili; içeriği bizim kararımız değil.
 *
 * ── ÇİVİLENEN ASIL KARAR: E-POSTA GÖVDEDEN DEĞİL OTURUMDAN ──────────────────
 * Başvurunun e-postası ARTIK BİR GİRDİ DEĞİL, kimliğin kendisi (kullanıcı kararı 11.08 · MB-04).
 * Gövdedeki adres DOĞRULANMAMIŞ bir metindi, hesabınki OTP'den geçmiş — ikisi ayrışabiliyordu.
 * Gövdeye e-posta konduğunda **yok sayılmalı**; sayılmazsa doğrulanmamış bir adres, doğrulanmış
 * gibi kayda geçer ve toptan yazışması oraya gider.
 *
 * ── VE BİR HÂL AYRIMI ───────────────────────────────────────────────────────
 * Başvuru YAPMAMIŞ müşteri bir HATA değildir: uç durumu döndürür, ekran "başvur" der. 404 dönmek
 * ekranı hata sayfasına düşürürdü.
 */
const db = serviceDb();

const authUserIds: string[] = [];
const profileIds: string[] = [];
let musteriToken: string;
let musteriId: string;

const get = (token: string, locale = 'tr') => app.request(`/api/v1/me/b2b?locale=${locale}`, { headers: bearer(token) });

function apply(body: unknown, token: string, locale = 'tr') {
  return app.request(`/api/v1/me/b2b/application?locale=${locale}`, {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const musteri = await createSignedInUser({ prefix: 'b2b-api', label: 'aday' });
  musteriToken = musteri.token;
  musteriId = musteri.profileId;
  authUserIds.push(musteri.authUserId);
  profileIds.push(musteri.profileId);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('GET /api/v1/me/b2b — başvuru durumu', () => {
  it('Bearer olmadan 401', async () => {
    expect((await app.request('/api/v1/me/b2b?locale=tr')).status).toBe(401);
  });

  it('BAŞVURMAMIŞ müşteri bir HATA değildir — durum döner', async () => {
    // 404 dönmek ekranı hata sayfasına düşürürdü; oysa söylenecek şey "henüz başvurmadınız".
    const res = await get(musteriToken);

    expect(res.status).toBe(200);
    const view = await envelopeData<Record<string, unknown>>(res);
    expect(view).toBeTruthy();
  });

  it('TANINMAYAN dil 400 `invalid_locale`', async () => {
    const res = await get(musteriToken, 'zz');

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_locale');
  });
});

describe('POST /api/v1/me/b2b/application — başvuru', () => {
  it('Bearer olmadan 401 — başvuru kimliğe yazılır', async () => {
    const res = await app.request('/api/v1/me/b2b/application?locale=tr', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });

  it('BOZUK gövde 400 `invalid_body`', async () => {
    const res = await apply({}, musteriToken);

    expect(res.status).toBe(400);
    expect(await envelopeError(res)).toBe('invalid_body');
  });

  it('gövdesiz istek 400', async () => {
    const res = await app.request('/api/v1/me/b2b/application?locale=tr', {
      method: 'POST',
      headers: bearer(musteriToken),
    });

    expect(res.status).toBe(400);
  });

  it('TANINMAYAN dil 400 — gövde denetiminden ÖNCE', async () => {
    // Sıra anlamlı: dil çözülemeden gövdenin retleri de çevrilemez. Ucun künyesi bu sırayı
    // koruyor; ters çevrilse hata mesajı müşterinin bilmediği bir dilde dönerdi.
    const res = await apply({}, musteriToken, 'zz');

    expect(await envelopeError(res)).toBe('invalid_locale');
  });

  it('GÖVDEDEKİ e-posta YOK SAYILIR — kimlik oturumdan gelir (MB-04)', async () => {
    /* Kullanıcı kararı 11.08: *"profesyonel bir kere oturum açsın, mailini girsin, OTP gelsin ve
       onaylasın; bu bizim mail adresimiz olsun."* Gövdedeki adres doğrulanmamış bir metin;
       sayılsaydı toptan yazışması doğrulanmamış bir adrese giderdi.
       İddia profilin e-postasının DEĞİŞMEDİĞİNİ ölçüyor — başvurunun kabul edilip edilmemesi
       (iş kuralı, dış doğrulama) bu testin konusu değil. */
    const oncesi = (await new UserProfileService(db).getById(musteriId))?.email;

    await apply(
      { email: 'uydurma@saldirgan.test', companyName: 'X', siret: '00000000000000', facts: null },
      musteriToken,
    );

    const sonrasi = (await new UserProfileService(db).getById(musteriId))?.email;
    expect(sonrasi).toBe(oncesi);
    expect(sonrasi).not.toBe('uydurma@saldirgan.test');
  });
});
