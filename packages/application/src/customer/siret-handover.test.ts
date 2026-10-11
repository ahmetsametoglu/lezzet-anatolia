import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { bindLoginToSiretRecord } from './siret-handover';

const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const profileIds: string[] = [];
const authUserIds: string[] = [];
let warehouseId = '';
let categoryId = '';
let productId = '';
let variantId = '';

/** Damgalı, testler arasında ayrı SIRET; biçim denetimi bu kapıda yok, eşitlik yeter. */
const siretOf = (n: number) => `${n}${String(stamp).slice(-13)}`;

/** Müşterinin kendi açtığı hesap: gerçek giriş, tetikleyicinin açtığı profil ve başvurudaki künye. */
async function applicant(n: number) {
  const email = `devir-${n}-${stamp}@example.test`;
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  authUserIds.push(data.user.id);
  const profile = await profiles.findByAuthUserId(data.user.id);
  if (!profile) throw new Error('tetikleyici profil açmadı');
  profileIds.push(profile.id);
  return profiles.update({
    id: profile.id,
    type: 'company',
    companyInfo: { legalName: `BAŞVURU ${n} SAS ${stamp}`, siret: siretOf(n) },
  });
}

/** Ofisin açtığı girişsiz kayıt, aynı SIRET'le. */
async function officeRecord(n: number) {
  const profile = await profiles.insert({
    name: `Ofis ${n} ${stamp}`,
    type: 'company',
    companyInfo: { legalName: `OFİS ${n} SAS ${stamp}`, siret: siretOf(n) },
    isDraft: true,
  });
  profileIds.push(profile.id);
  return profile;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'DVR' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Devir testi ${stamp}` } })).id;
  const created = await new ProductService(db).create({ name: { tr: `Devir ürünü ${stamp}` }, categoryId, variants: [{ label: { tr: '1 kg' } }] });
  productId = created.product.id;
  variantId = created.variants[0]!.id;
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds,
    authUserIds,
    warehouseIds: [warehouseId],
  });
});

describe('bindLoginToSiretRecord', () => {
  it('boş hesabın girişi ofis kaydına geçer; müşteri aynı e-postayla girince ofis kaydına düşer', async () => {
    const basvuru = await applicant(1);
    const ofis = await officeRecord(1);

    const sonuc = await bindLoginToSiretRecord(db, { applicantId: basvuru.id, targetId: ofis.id });
    expect(sonuc).toMatchObject({ status: 'ok', target: { id: ofis.id, email: basvuru.email } });
    expect((await profiles.getById(basvuru.id))?.anonymizedAt).not.toBeNull();

    // Yeniden giriş: yeni giriş kullanıcısı, e-postası tutan girişsiz kayda bağlanır.
    const { data, error } = await db.auth.admin.createUser({ email: basvuru.email!, email_confirm: true });
    if (error) throw error;
    authUserIds.push(data.user.id);
    expect((await profiles.findByAuthUserId(data.user.id))?.id).toBe(ofis.id);
  });

  it('başvuru hesabında sipariş varsa devir yapılmaz ve hesap silinmez', async () => {
    const basvuru = await applicant(2);
    const ofis = await officeRecord(2);
    await new OrderService(db).create(
      { customerId: basvuru.id, warehouseId, channel: 'b2c', orderSource: 'web', deliveryType: 'route', status: 'confirmed', orderedTotalCents: 1200 },
      [{ variantId, qty: 1, unitPriceCents: 1200, vatRate: 5.5 }],
    );

    expect(await bindLoginToSiretRecord(db, { applicantId: basvuru.id, targetId: ofis.id })).toEqual({ status: 'applicant_has_orders' });
    expect((await profiles.getById(basvuru.id))?.anonymizedAt).toBeNull();
  });

  it('girişe bağlı kayda devir yapılmaz; bir kayıt tek giriş taşır', async () => {
    const basvuru = await applicant(3);
    const baskaGiris = await applicant(4);
    await profiles.update({ id: baskaGiris.id, companyInfo: { legalName: `BAŞKA SAS ${stamp}`, siret: siretOf(3) } });

    expect(await bindLoginToSiretRecord(db, { applicantId: basvuru.id, targetId: baskaGiris.id })).toEqual({ status: 'target_bound' });
    expect((await profiles.getById(basvuru.id))?.anonymizedAt).toBeNull();
  });

  it("SIRET'i tutmayan kayda devir yapılmaz", async () => {
    const basvuru = await applicant(5);
    const ofis = await officeRecord(6);

    expect(await bindLoginToSiretRecord(db, { applicantId: basvuru.id, targetId: ofis.id })).toEqual({ status: 'siret_mismatch' });
    expect((await profiles.getById(basvuru.id))?.anonymizedAt).toBeNull();
  });
});
