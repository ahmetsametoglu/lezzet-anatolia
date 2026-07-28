import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { UserProfileService } from './user-profile.service';

/**
 * Rol kümesi (04.3) — DB tarafı. Kural motorun (`domain-core/identity/roles`), ama **son emniyet
 * veritabanındadır**: uygulama unutsa da geçersiz küme yazılamaz.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const createdIds: string[] = [];

async function createProfile(ad: string) {
  const p = await profiles.insert({ name: `${ad} ${stamp}` });
  createdIds.push(p.id);
  return p;
}

beforeAll(async () => {
  await createProfile('rol-testi');
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdIds });
});

describe('kural DB kısıtında zorlanır', () => {
  it('yeni profil varsayılan olarak yalnız müşteridir', async () => {
    const p = await createProfile('varsayilan');
    expect(p.roles).toEqual(['customer']);
  });

  it('müşteri + personel BİR ARADA yazılamaz', async () => {
    const p = await createProfile('cakisma');
    await expect(profiles.setRoles(p.id, ['customer', 'warehouse'])).rejects.toThrow();
  });

  it('boş rol kümesi yazılamaz', async () => {
    const p = await createProfile('bos');
    await expect(profiles.setRoles(p.id, [])).rejects.toThrow();
  });

  it('personel içinde çoklu rol yazılabilir — depo + muhasebe', async () => {
    const p = await createProfile('coklu');
    const updated = await profiles.setRoles(p.id, ['warehouse', 'accounting']);
    expect(updated.roles).toEqual(['warehouse', 'accounting']);
  });
});

describe('okuma uçları', () => {
  it('hasRole dizide arar; isStaff operasyon rolü arar', async () => {
    const p = await createProfile('okuma');
    const authUser = await db.auth.admin.createUser({ email: `rol${stamp}@ornek.fr`, email_confirm: true });
    const authUserId = authUser.data.user!.id;
    // Trigger profili açtı; testin kendi profilini bağlamak yerine trigger'ınkini kullanıyoruz.
    const triggerProfili = await profiles.findByAuthUserId(authUserId);
    createdIds.push(triggerProfili!.id);

    await profiles.setRoles(triggerProfili!.id, ['warehouse', 'accounting']);
    expect(await profiles.hasRole(authUserId, 'accounting')).toBe(true);
    expect(await profiles.hasRole(authUserId, 'courier')).toBe(false);
    expect(await profiles.isStaff(authUserId)).toBe(true);

    await profiles.setRoles(triggerProfili!.id, ['customer']);
    expect(await profiles.isStaff(authUserId)).toBe(false);

    await db.auth.admin.deleteUser(authUserId);
    expect(p.roles).toEqual(['customer']);
  });

  it('role göre listeleme dizide arar', async () => {
    const p = await createProfile('listeleme');
    await profiles.setRoles(p.id, ['courier', 'accounting']);

    const kuryeler = await profiles.listByRole('courier');
    expect(kuryeler.some((r) => r.id === p.id)).toBe(true);
    const muhasebeciler = await profiles.listByRole('accounting');
    expect(muhasebeciler.some((r) => r.id === p.id)).toBe(true);
  });
});
