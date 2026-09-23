import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppNotificationService, UserProfileService, serviceDb } from '@lezzet/database';
import { mustDelete, purgeTestData } from '@lezzet/database/testing';
import { app } from '../../app';
import { bearer, createSignedInUser, type SignedInUser } from '../../lib/testing';

/*
  Başvurunun sonucu başvurana söylenir: ret gerekçesi veride zorunlu ve üç dile çevriliyor, okuyucusu olmazsa aday aynı eksikle
  yeniden başvurur. Karar hangi yüzeyden verilirse verilsin haber aynı kapıdan doğar; bu dosya mobil operasyon yüzeyini sınar.
*/

const db = serviceDb();
const stamp = Date.now();
const authUserIds: string[] = [];
const profileIds: string[] = [];
let admin: SignedInUser;

/** Kuyruğa düşmüş bir başvuru: künye yazılı, karar verilmemiş. */
async function bekleyenBasvuru(label: string): Promise<string> {
  const aday = await createSignedInUser({ prefix: 'yonetim-b2b', label });
  authUserIds.push(aday.authUserId);
  profileIds.push(aday.profileId);
  await new UserProfileService(db).update({
    id: aday.profileId,
    type: 'company',
    companyInfo: { legalName: `Test Gıda ${label} ${stamp}`, siret: '12345678901234', activityCode: null, foundedYear: null, isActive: true },
    b2bApproved: false,
  });
  return aday.profileId;
}

/* Haber kararın cevabını bekletmez (uç bilerek `void` ile gönderiyor), o yüzden satır kısa bir süre içinde aranır. */
async function haberBekle(customerId: string): Promise<string[]> {
  for (let i = 0; i < 20; i += 1) {
    const { rows } = await new AppNotificationService(db).listByProfile(customerId, { limit: 20 });
    if (rows.length > 0) return rows.map((row) => row.kind);
    await new Promise((r) => setTimeout(r, 250));
  }
  return [];
}

beforeAll(async () => {
  admin = await createSignedInUser({ prefix: 'yonetim-b2b', label: 'admin', roles: ['admin'] });
  authUserIds.push(admin.authUserId);
  profileIds.push(admin.profileId);
});

afterAll(async () => {
  for (const id of profileIds) await mustDelete(db, 'notification', (q) => q.eq('profile_id', id));
  await purgeTestData(db, { profileIds, authUserIds });
});

describe('mobil operasyondan verilen B2B kararı', () => {
  it('onayda başvurana haber doğar', async () => {
    const customerId = await bekleyenBasvuru('onay');

    const res = await app.request(`/api/v1/management/b2b/${customerId}/approve`, { method: 'POST', headers: bearer(admin.token) });

    expect(await res.json()).toMatchObject({ data: { result: 'ok', status: 'approved' } });
    expect(await haberBekle(customerId)).toContain('b2b_application_result');
  });

  it('rette de haber doğar — gerekçeyi okuyacak kişi başvurandır', async () => {
    const customerId = await bekleyenBasvuru('ret');

    const res = await app.request(`/api/v1/management/b2b/${customerId}/reject`, {
      method: 'POST',
      headers: { ...bearer(admin.token), 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Künye adresi başvurudaki adresle uyuşmuyor.' }),
    });

    expect(await res.json()).toMatchObject({ data: { result: 'ok', status: 'rejected' } });
    expect(await haberBekle(customerId)).toContain('b2b_application_result');
  });
});
