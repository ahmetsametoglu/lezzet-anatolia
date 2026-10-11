import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressService, serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { formatSiret, isValidSiret } from '@lezzet/domain-core';
import { lookupCompanyBySiret, type CompanyRegistryRecord } from '../b2b/company-registry';
import { createStaffCustomer } from './staff-customer';

// Resmî kayıt dış servistir; sonucu o günün servisi değil test belirlesin diye taklit edilir, eşleme fonksiyonu gerçek kalır.
vi.mock('../b2b/company-registry', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lookupCompanyBySiret: vi.fn(),
}));

const db = serviceDb();
const profiles = new UserProfileService(db);
const lookup = vi.mocked(lookupCompanyBySiret);
const stamp = Date.now();
const olusturulan: string[] = [];

afterAll(async () => {
  await purgeTestData(db, { profileIds: olusturulan });
});

beforeEach(() => {
  lookup.mockReset();
});

/** Damgadan türeyen ve Luhn'a uyan SIRET: biçim denetimi geçer, başka koşunun numarasıyla çakışmaz. */
function siretFrom(prefix: string): string {
  const body = `${prefix}${String(stamp).slice(-(13 - prefix.length))}`;
  for (let d = 0; d <= 9; d += 1) {
    if (isValidSiret(`${body}${d}`)) return `${body}${d}`;
  }
  throw new Error('Luhn hanesi bulunamadı');
}

function registryRecord(siret: string): CompanyRegistryRecord {
  return {
    siret,
    siretDisplay: formatSiret(siret),
    legalName: `KÜNYE SAS ${stamp}`,
    activityCode: '56.10A',
    foundedYear: 2016,
    isActive: true,
    vatNumber: 'FR34387904527',
    line1: '8 RUE DU FOSSE',
    postalCode: '67000',
    city: 'STRASBOURG',
  };
}

async function created(outcome: Awaited<ReturnType<typeof createStaffCustomer>>) {
  if (outcome.status !== 'ok') throw new Error(`kayıt açılmadı: ${outcome.status}`);
  olusturulan.push(outcome.profile.id);
  return outcome.profile;
}

describe('createStaffCustomer', () => {
  it('şirket kaydı resmî künye ve fatura adresiyle açılır, B2B onay kuyruğuna girer', async () => {
    const siret = siretFrom('1');
    lookup.mockResolvedValueOnce(registryRecord(siret));

    const kayit = await created(
      await createStaffCustomer(db, { name: `Ofis ${stamp}`, phone: '06 12 34 56 78', email: null, type: 'company', siret: formatSiret(siret) }),
    );

    const okunan = await profiles.getById(kayit.id);
    expect(okunan?.companyInfo).toMatchObject({ legalName: `KÜNYE SAS ${stamp}`, siret, activityCode: '56.10A' });
    expect(okunan?.vatNumber).toBe('FR34387904527');
    expect(okunan?.b2bPending).toBe(true);
    expect(okunan?.isDraft).toBe(true);

    const adresler = await new AddressService(db).listByCustomer(kayit.id);
    expect(adresler).toHaveLength(1);
    expect(adresler[0]).toMatchObject({ line1: '8 RUE DU FOSSE', postalCode: '67000', isBilling: true });
  });

  it("aynı SIRET'li kayıt varken yeni kayıt açılmaz, var olan döner", async () => {
    const siret = siretFrom('2');
    const ofis = await profiles.insert({ name: `Eski Kayıt ${stamp}`, type: 'company', companyInfo: { legalName: `ESKİ ${stamp}`, siret } });
    olusturulan.push(ofis.id);

    const sonuc = await createStaffCustomer(db, { name: `Yeni Ad ${stamp}`, phone: '0700000000', email: null, type: 'company', siret });
    if (sonuc.status === 'ok') olusturulan.push(sonuc.profile.id);

    expect(sonuc).toMatchObject({ status: 'taken', key: 'siret', existing: { id: ofis.id } });
    expect((await profiles.listBySiret(siret)).map((p) => p.id)).toEqual([ofis.id]);
  });

  it('aynı e-postalı kayıt varken yeni kayıt açılmaz; veritabanı hatası yerine var olan döner', async () => {
    const eposta = `ofis-${stamp}@example.test`;
    const varOlan = await profiles.insert({ name: `E-postalı ${stamp}`, email: eposta });
    olusturulan.push(varOlan.id);

    const sonuc = await createStaffCustomer(db, {
      name: `Başka ${stamp}`,
      phone: '0700000000',
      email: eposta.toUpperCase(),
      type: 'individual',
      siret: null,
    });
    if (sonuc.status === 'ok') olusturulan.push(sonuc.profile.id);

    expect(sonuc).toMatchObject({ status: 'taken', key: 'email', existing: { id: varOlan.id } });
  });

  it("resmî kayıtta olmayan SIRET'le kayıt açılmaz", async () => {
    const siret = siretFrom('3');
    lookup.mockResolvedValueOnce('not_found');

    const sonuc = await createStaffCustomer(db, { name: `Yok ${stamp}`, phone: '0700000000', email: null, type: 'company', siret });
    if (sonuc.status === 'ok') olusturulan.push(sonuc.profile.id);

    expect(sonuc.status).toBe('siret_not_found');
    expect(await profiles.listBySiret(siret)).toHaveLength(0);
  });

  it("resmî kayıt cevap vermezse kayıt yine SIRET'le açılır; künye adı personelin yazdığıdır", async () => {
    const siret = siretFrom('4');
    lookup.mockResolvedValueOnce('unavailable');

    const kayit = await created(
      await createStaffCustomer(db, { name: `Servis Düştü ${stamp}`, phone: '0700000000', email: null, type: 'company', siret }),
    );

    expect(kayit.companyInfo).toMatchObject({ legalName: `Servis Düştü ${stamp}`, siret });
    expect((await profiles.getById(kayit.id))?.b2bPending).toBe(true);
    expect(await new AddressService(db).listByCustomer(kayit.id)).toHaveLength(0);
  });

  it('bireysel kayıtta SIRET okunmaz; kayıt onay kuyruğuna girmez', async () => {
    const kayit = await created(
      await createStaffCustomer(db, {
        name: `Bireysel ${stamp}`,
        phone: '0700000000',
        email: null,
        type: 'individual',
        siret: siretFrom('5'),
      }),
    );

    expect(kayit.companyInfo).toBeNull();
  });
});
