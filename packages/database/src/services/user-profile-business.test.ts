import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { UserProfileService } from './user-profile.service';

/** Müşterinin işi veride korunur: QUALITE yalnız onaylı B2B şirkete yazılır (docs/feature/iki-is.md, karar 7 ve 10). */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const createdIds: string[] = [];

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdIds });
});

describe('müşterinin işi', () => {
  it('QUALITE yalnız onaylı B2B şirkete yazılır; QUALITE müşterisinin onayı ve tipi işi Lezzet olmadan değişmez', async () => {
    const bireysel = await profiles.insert({ name: `Bireysel ${stamp}` });
    const sirket = await profiles.insert({
      name: `Restoran ${stamp}`,
      type: 'company',
      companyInfo: { legalName: 'SARL İş', siret: '12345678901234', activityCode: '5610A' },
      b2bApproved: false,
    });
    createdIds.push(bireysel.id, sirket.id);
    expect(sirket.business).toBe('lezzet');

    await expect(profiles.update({ id: bireysel.id, business: 'qualite' })).rejects.toThrow(/user_profiles_business_b2b/);
    await expect(profiles.update({ id: sirket.id, business: 'qualite' })).rejects.toThrow(/user_profiles_business_b2b/);

    await profiles.approveB2b(sirket.id);
    expect((await profiles.update({ id: sirket.id, business: 'qualite' })).business).toBe('qualite');

    const ret = { actorId: bireysel.id, reason: 'Faaliyet kapandı' };
    await expect(profiles.rejectB2b(sirket.id, ret)).rejects.toThrow(/user_profiles_business_b2b/);
    await expect(profiles.update({ id: sirket.id, type: 'individual' })).rejects.toThrow(/user_profiles_business_b2b/);

    await profiles.update({ id: sirket.id, business: 'lezzet' });
    expect((await profiles.rejectB2b(sirket.id, ret)).b2bApproved).toBe(false);
  });
});
