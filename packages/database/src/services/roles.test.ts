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
const damga = Date.now();
const acilanlar: string[] = [];

async function profilAc(ad: string) {
  const p = await profiles.insert({ name: `${ad} ${damga}` });
  acilanlar.push(p.id);
  return p;
}

beforeAll(async () => {
  await profilAc('rol-testi');
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: acilanlar });
});

describe('kural DB kısıtında zorlanır', () => {
  it('yeni profil varsayılan olarak yalnız müşteridir', async () => {
    const p = await profilAc('varsayilan');
    expect(p.roles).toEqual(['customer']);
  });

  it('müşteri + personel BİR ARADA yazılamaz', async () => {
    const p = await profilAc('cakisma');
    await expect(profiles.setRoles(p.id, ['customer', 'warehouse'])).rejects.toThrow();
  });

  it('boş rol kümesi yazılamaz', async () => {
    const p = await profilAc('bos');
    await expect(profiles.setRoles(p.id, [])).rejects.toThrow();
  });

  it('personel içinde çoklu rol yazılabilir — depo + muhasebe', async () => {
    const p = await profilAc('coklu');
    const guncel = await profiles.setRoles(p.id, ['warehouse', 'accounting']);
    expect(guncel.roles).toEqual(['warehouse', 'accounting']);
  });
});

describe('okuma uçları', () => {
  it('hasRole dizide arar; isStaff operasyon rolü arar', async () => {
    const p = await profilAc('okuma');
    const authUser = await db.auth.admin.createUser({ email: `rol${damga}@ornek.fr`, email_confirm: true });
    const authUserId = authUser.data.user!.id;
    // Trigger profili açtı; testin kendi profilini bağlamak yerine trigger'ınkini kullanıyoruz.
    const triggerProfili = await profiles.findByAuthUserId(authUserId);
    acilanlar.push(triggerProfili!.id);

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
    const p = await profilAc('listeleme');
    await profiles.setRoles(p.id, ['courier', 'accounting']);

    const kuryeler = await profiles.listByRole('courier');
    expect(kuryeler.some((r) => r.id === p.id)).toBe(true);
    const muhasebeciler = await profiles.listByRole('accounting');
    expect(muhasebeciler.some((r) => r.id === p.id)).toBe(true);
  });
});
