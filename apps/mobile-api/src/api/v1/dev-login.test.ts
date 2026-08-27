import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';

/**
 * **Hızlı giriş kapısı: profili olan adrese oturum verir ve ROLÜNE DOKUNMAZ** (27.08).
 *
 * Kapının 200 dönen yolları `preferences.test.ts`te zaten çivili (mount, kayıtsız e-posta kabulü,
 * dönenin oturum değil hash olması). Burada çivilenen, oradan görünmeyen şey: **bağlama.**
 * `generateLink` var olan profili yaratmıyor, `0002` trigger'ı e-postayla bulup bağlıyor ve rolü
 * koruyor. Bu cümle 11.08'de ölçülmüştü ama testi yoktu — ve 26.08'de yanlış giden şey tam da
 * bağlamanın atlanmasıydı (auth satırı profilden önce doğunca trigger yeni ve `{admin}` bir profil
 * açtı). Kararın kendisi motorda sınanıyor (`packages/application/src/auth/dev-login.test.ts`);
 * burada sınanan, kapının o karara BAĞLI olması ve kurulu veritabanında yolun açık kalması.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();

/** Profili VAR ama auth hesabı yok — bağlamanın sınanabildiği tek başlangıç hâli. */
const bilinen = `dev-var-${stamp}@example.test`;
let bilinenId = '';

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

afterAll(async () => {
  // Auth kimliği yanıttan değil profilden okunur: uç bilerek user gövdesi taşımıyor.
  const kalan = await profiles.findByEmail(bilinen);
  await purgeTestData(db, {
    profileIds: bilinenId ? [bilinenId] : [],
    authUserIds: kalan?.authUserId ? [kalan.authUserId] : [],
  });
});

describe('POST /api/v1/auth/dev-session — bağlama', () => {
  it('profili OLAN adrese jeton verir, AYNI profile bağlar ve rolü korur', async () => {
    const profile = await profiles.insert({
      roles: ['customer'],
      type: 'individual',
      name: `Dev Giriş ${stamp}`,
      email: bilinen,
    });
    bilinenId = profile.id;
    expect(profile.authUserId).toBeNull();

    const res = await app.request('/api/v1/auth/dev-session', json({ email: bilinen }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tokenHash: string }; error: null };
    expect(body.data.tokenHash).toBeTruthy();

    const bagli = await profiles.findByEmail(bilinen);
    // İKİNCİ profil doğmadı: kimlik aynı satır, artık auth'lu.
    expect(bagli?.id).toBe(profile.id);
    expect(bagli?.authUserId).toBeTruthy();
    // Rol KORUNUR — bağlama bir yükseltme değildir (26.08'de `{admin}` doğuran arızanın aynası).
    expect(bagli?.roles).toEqual(['customer']);
  });

  it('gövdesiz istek 400 — ret sırası: önce biçim, sonra veritabanı hâli', async () => {
    const res = await app.request('/api/v1/auth/dev-session', json({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
  });
});
