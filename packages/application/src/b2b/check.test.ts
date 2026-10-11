import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { readB2bCheck } from './check';

/**
 * Kartın ikinci okuması (AI özeti) dış servise gitmez ve satıra dokunmaz, ama kartla aynı sinyali kurar. Tazeleyen dal gerçek
 * VIES ve resmî kayıt uçlarına çıktığı için burada sınanmaz; kuralı `vat-refresh.test.ts`'te.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const olusturulan: string[] = [];

const gunOnce = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

afterAll(async () => {
  await purgeTestData(db, { profileIds: olusturulan });
});

/** Her kaydın adı ayrıdır, çünkü aynı adla açılan kayıtları `Mükerrer` sinyali haklı olarak birbirinin kopyası sayar. */
async function newB2b(vat: { number: string | null; valid: boolean | null; checkedAt: string | null }) {
  const sira = olusturulan.length;
  const profile = await profiles.insert({
    roles: ['customer'],
    type: 'company',
    name: `Kart Okuma ${sira} ${stamp}`,
    email: `kart-${stamp}-${sira}@example.test`,
    country: 'FR',
    // SIRET'siz künye BİLEREK: resmî kayıt tazelemesi de dış servise çıkıyor ve bu dosya ağa
    // çıkmamalı. Kayıt sinyali "Sinyal yok" der, testin sorusu KDV satırı.
    companyInfo: { legalName: `Kart Okuma ${sira} SARL ${stamp}` },
    vatNumber: vat.number,
    vatNumberValid: vat.valid,
    vatNumberCheckedAt: vat.checkedAt,
  });
  olusturulan.push(profile.id);
  return profile;
}

const kdvSatiri = (view: NonNullable<Awaited<ReturnType<typeof readB2bCheck>>>) =>
  view.signals.find((s) => s.label.startsWith('KDV') || s.label.startsWith('VIES'));

describe('readB2bCheck · refreshExternal: false', () => {
  it('SATIRA DOKUNMAZ — damga ve bayrak olduğu gibi kalır', async () => {
    const damga = gunOnce(12);
    const profile = await newB2b({ number: 'FR34387904527', valid: true, checkedAt: damga });

    await readB2bCheck(db, profile.id, { refreshExternal: false });

    const sonra = await profiles.getById(profile.id);
    expect(sonra?.vatNumberValid).toBe(true);
    expect(Date.parse(sonra?.vatNumberCheckedAt ?? '')).toBe(Date.parse(damga));
  });

  it('KAYITLI değeri YAŞIYLA gösterir — özet, kartın söylediğini söyler', async () => {
    const profile = await newB2b({ number: 'FR34387904527', valid: true, checkedAt: gunOnce(12) });

    const view = await readB2bCheck(db, profile.id, { refreshExternal: false });
    expect(kdvSatiri(view!)).toMatchObject({ value: 'Geçerli · 12 gün önce', tone: 'ok' });
  });

  it('BAYAT damga sarıya çeker — eşik motorda, okuma onu olduğu gibi taşır', async () => {
    const profile = await newB2b({ number: 'FR34387904527', valid: true, checkedAt: gunOnce(400) });

    const view = await readB2bCheck(db, profile.id, { refreshExternal: false });
    expect(kdvSatiri(view!)?.value).toContain('bayat');
    expect(kdvSatiri(view!)?.tone).toBe('warn');
    // Bayat doğrulama kartın bayrağını sarıya çeker ama KIRMIZIYA çekmez.
    expect(view?.flag.tone).toBe('warn');
  });

  it('hiç sorulmamış numara "Sorulmadı" kalır — tazelemesiz okuma cevap UYDURMAZ', async () => {
    const profile = await newB2b({ number: 'FR38825322019', valid: null, checkedAt: null });

    const view = await readB2bCheck(db, profile.id, { refreshExternal: false });
    expect(kdvSatiri(view!)).toMatchObject({ value: 'Sorulmadı', tone: 'warn' });
  });

  it('olmayan müşteride null döner (ekran "kart okunamadı" der)', async () => {
    expect(await readB2bCheck(db, '00000000-0000-4000-8000-000000000000', { refreshExternal: false })).toBeNull();
  });
});

describe('readB2bCheck · mükerrer adayı', () => {
  /** Ad ve telefon ortak değil: ofisin açtığı kayıtla başvuruyu birleştiren tek olgu SIRET. */
  async function newCompany(label: string, siret: string) {
    const profile = await profiles.insert({
      roles: ['customer'],
      type: 'company',
      name: `${label} ${stamp}`,
      email: null,
      country: 'FR',
      companyInfo: { legalName: `${label} SAS ${stamp}`, siret },
    });
    olusturulan.push(profile.id);
    return profile;
  }

  it("aynı SIRET'li kayıt adı ve telefonu farklı olsa da aday çıkar; başka SIRET çıkmaz", async () => {
    const siret = `9${String(stamp).slice(-13)}`;
    const ofis = await newCompany('Ofis Kaydı', siret);
    const baska = await newCompany('Komşu Şube', `8${String(stamp).slice(-13)}`);
    const basvuru = await newCompany('Başvuru Hesabı', siret);

    const view = await readB2bCheck(db, basvuru.id, { refreshExternal: false });
    const adaylar = view?.duplicates.map((d) => d.id) ?? [];
    expect(adaylar).toContain(ofis.id);
    expect(adaylar).not.toContain(baska.id);
  });
});
