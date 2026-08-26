import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, PushDeviceService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { listSendablePushTokens } from '@lezzet/application';
import { app } from '../../app';
import { createSignedInUser } from '../../lib/testing';

/**
 * `/api/v1/me/push-devices` (14.14) — çivilenen kurallar kurgu incelemesinin iki bulgusu:
 *
 *   1. **SAHİP DEVRİ (8. bulgu):** aynı jetonu ikinci hesap kaydettiğinde cihaz EL DEĞİŞTİRİR —
 *      son giren kazanır, çünkü cihaz fiziksel olarak onun elindedir. Devir olmasaydı aile
 *      telefonunda önceki hesabın bildirimi sonrakine düşerdi: kişisel veri ifşası.
 *   2. **İZİN KARASI (10. bulgu):** OS'ta bildirimi kapatan kullanıcının jetonu canlı kalır ve
 *      Expo "gönderdim" der — `enabled:false` raporu cihazı gönderilebilir listesinden düşürür.
 *
 * Çıkışın sahiplik süzgeci de burada: devrolmuş cihazın GECİKMİŞ çıkışı yeni sahbin kaydını sökemez.
 */
const db = serviceDb();
const devices = new PushDeviceService(db);

const stamp = Date.now();
const authUserIds: string[] = [];
const profileIds: string[] = [];

let aToken: string;
let aId: string;
let bToken: string;
let bId: string;

const jeton = (n: number) => `ExponentPushToken[test-${stamp}-${n}]`;
const post = (token: string, body: unknown) => ({
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  const a = await createSignedInUser({ prefix: 'push-api', label: 'a' });
  authUserIds.push(a.authUserId);
  profileIds.push(a.profileId);
  aToken = a.token;
  aId = a.profileId;

  const b = await createSignedInUser({ prefix: 'push-api', label: 'b' });
  authUserIds.push(b.authUserId);
  profileIds.push(b.profileId);
  bToken = b.token;
  bId = b.profileId;
});

afterAll(async () => {
  // Jetonlar profile cascade bağlı — profil purge'ü yeter (0050 FK kararı).
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('kayıt ve sahip devri', () => {
  it('aynı cihazı ikinci hesap kaydedince SAHİP DEĞİŞİR — önceki hesap sağırlaşır', async () => {
    const t = jeton(1);
    expect((await app.request('/api/v1/me/push-devices', post(aToken, { token: t, platform: 'android', enabled: true }))).status).toBe(200);
    expect(await listSendablePushTokens(db, aId)).toContain(t);

    // A çıkış yapmadı (jeton silinmedi) — B aynı cihazdan giriş yapıp kaydoldu.
    expect((await app.request('/api/v1/me/push-devices', post(bToken, { token: t, platform: 'android', enabled: true }))).status).toBe(200);

    expect(await listSendablePushTokens(db, bId)).toContain(t); // cihaz artık B'nin kulağı
    expect(await listSendablePushTokens(db, aId)).not.toContain(t); // A'ya artık BU cihazdan ulaşılmaz
  });

  it('izni KAPALI raporlanan cihaz gönderilebilir listesinden düşer — sessiz kara delik kapanır', async () => {
    const t = jeton(2);
    await app.request('/api/v1/me/push-devices', post(aToken, { token: t, platform: 'ios', enabled: true }));
    expect(await listSendablePushTokens(db, aId)).toContain(t);

    // Uygulama açılışı izni kapalı raporladı (aynı uç — kayıt ve rapor tek kapı).
    await app.request('/api/v1/me/push-devices', post(aToken, { token: t, platform: 'ios', enabled: false }));
    expect(await listSendablePushTokens(db, aId)).not.toContain(t);
    // Kayıt SİLİNMEDİ: izin geri açılınca aynı kapıdan geri gelir.
    expect(await devices.findByToken(t)).not.toBeNull();
  });
});

describe('çıkış', () => {
  it('çıkış kendi jetonunu siler; DEVROLMUŞ cihazın gecikmiş çıkışı yeni sahibi sökemez', async () => {
    const t = jeton(3);
    await app.request('/api/v1/me/push-devices', post(aToken, { token: t, platform: 'android', enabled: true }));
    // Cihaz B'ye devroldu (A çıkışı unutmuştu)...
    await app.request('/api/v1/me/push-devices', post(bToken, { token: t, platform: 'android', enabled: true }));

    // ...A'nın gecikmiş çıkışı geldi: kendi kaydı yok, B'ninkine DOKUNAMAZ.
    const gecikmis = await app.request('/api/v1/me/push-devices/remove', post(aToken, { token: t }));
    expect(((await gecikmis.json()) as { data: { removed: boolean } }).data.removed).toBe(false);
    expect(await listSendablePushTokens(db, bId)).toContain(t); // B hâlâ duyuyor

    // B'nin kendi çıkışı ise siler.
    const kendi = await app.request('/api/v1/me/push-devices/remove', post(bToken, { token: t }));
    expect(((await kendi.json()) as { data: { removed: boolean } }).data.removed).toBe(true);
    expect(await listSendablePushTokens(db, bId)).not.toContain(t);
  });
});

describe('zarf ve kapı', () => {
  it('Bearer olmadan 401; bozuk gövde 400', async () => {
    expect((await app.request('/api/v1/me/push-devices', { method: 'POST' })).status).toBe(401);
    const res = await app.request('/api/v1/me/push-devices', post(aToken, { token: 'kisa', platform: 'windows' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_body');
  });
});
