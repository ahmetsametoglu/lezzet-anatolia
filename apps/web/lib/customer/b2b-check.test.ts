import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { readB2bCheck } from './b2b-check';

/**
 * **Onay kartının İKİNCİ okuması dış servise gitmez** (28.08).
 *
 * Ekran kart başına iki server action tetikliyor: `readB2bCheckAction` kartı çizer,
 * `b2bSummaryAction` AI cümlesini alır. İkincisi de bu fonksiyonu çağırıyordu ve dış servisleri
 * baştan soruyordu — kart başına **iki SIRET + iki VIES** sorgusu ve KDV damgasına ikinci yazım.
 * VIES'in eşzamanlılık sınırı olduğu için bu yalnız israf değil, `MS_MAX_CONCURRENT_REQ`
 * ihtimalini kendi elimizle artırmaktı.
 *
 * Testin sınadığı iki şey: **(a)** tazelemesiz okuma satıra DOKUNMUYOR, **(b)** ürettiği sinyal
 * tazelenmiş okumanınkiyle aynı cümleyi kuruyor. İkincisi taşıyıcı — AI özeti kartta yazandan
 * başka bir şey anlatırsa operatör hangisine inanacağını bilemez.
 *
 * Tazeleyen dal BİLEREK sınanmıyor: gerçek VIES ve resmî kayıt uçlarına çıkar, yani sonucu bizim
 * kodumuz değil o gün servislerin hâli belirler (ölçüldü 27–28.08: Fransa `MS_MAX_CONCURRENT_REQ`,
 * Almanya `MS_UNAVAILABLE`). Tazelemenin KENDİ kuralı ayrıca çivili —
 * `packages/application/src/b2b/vat-refresh.test.ts`.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const olusturulan: string[] = [];

const gunOnce = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

afterAll(async () => {
  await purgeTestData(db, { profileIds: olusturulan });
});

/**
 * Her kaydın adı AYRI olmak zorunda — ilk yazımda hepsi aynı adı taşıyordu ve `Mükerrer` sinyali
 * onları haklı olarak birbirinin kopyası saydı; bayrak `bad`e döndü, test kırmızı. Dedektör
 * çalışıyordu, fikstür yanlıştı: dört B2B kaydını aynı adla açmak gerçek hayatta da mükerrerdir.
 */
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
