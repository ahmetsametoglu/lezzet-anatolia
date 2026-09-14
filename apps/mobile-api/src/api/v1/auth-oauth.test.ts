import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, envelopeData, envelopeError } from '../../lib/testing';

/*
  GOOGLE DÖNÜŞÜNÜN KAYIT KAPISI (21.312) — `POST /api/v1/auth/oauth/check` uçtan uca, port açmadan.
  Test yardımcısı hesabı açıp HEMEN oturum açtırıyor: açılış ile son giriş arası saniyenin altında, yani
  Google'la ilk kez gelen hesabın aynısı ("bu girişte doğdu"). Personel rolü bu hâlde bile korunur.
*/

type SignedInUser = Awaited<ReturnType<typeof createSignedInUser>>;
let fresh: SignedInUser;
let staff: SignedInUser;

beforeAll(async () => {
  fresh = await createSignedInUser({ prefix: 'oauth-check', label: 'yeni' });
  staff = await createSignedInUser({ prefix: 'oauth-check', label: 'personel', roles: ['admin'] });
});

afterAll(async () => {
  await purgeTestData(serviceDb(), {
    profileIds: [fresh.profileId, staff.profileId],
    authUserIds: [staff.authUserId],
  });
});

describe('POST /api/v1/auth/oauth/check', () => {
  it('bu girişte doğan müşteri hesabı SİLİNİR — 403 not_registered, profil sahipsiz kalır', async () => {
    const res = await app.request('/api/v1/auth/oauth/check', { method: 'POST', headers: bearer(fresh.token) });
    expect(res.status).toBe(403);
    expect(await envelopeError(res)).toBe('not_registered');

    const db = serviceDb();
    const { data } = await db.auth.admin.getUserById(fresh.authUserId);
    expect(data.user).toBeNull();
    const profile = await new UserProfileService(db).getById(fresh.profileId);
    expect(profile?.authUserId).toBeNull();
  });

  it('PERSONEL hesabı yeni de olsa korunur — 200 kept', async () => {
    const res = await app.request('/api/v1/auth/oauth/check', { method: 'POST', headers: bearer(staff.token) });
    expect(res.status).toBe(200);
    expect(await envelopeData(res)).toBe('kept');

    const { data } = await serviceDb().auth.admin.getUserById(staff.authUserId);
    expect(data.user?.id).toBe(staff.authUserId);
  });

  it('oturumsuz istek kapıya hiç gelmez — 401', async () => {
    const res = await app.request('/api/v1/auth/oauth/check', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
