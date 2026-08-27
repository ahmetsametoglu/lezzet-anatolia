import { afterAll, describe, expect, it } from 'vitest';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { refreshVatNumberCheck } from './vat-check';

/**
 * **KDV doğrulamasının TAZELENMESİ** (09.11 · 27.08).
 *
 * Çivilenen kural tek cümle: **kesin cevap yazılır, "sorulamadı" hiçbir şeyi silmez.**
 *
 * Testin varlık sebebi, kuralın bozulduğunda SESSİZ olması. Bayrağı `null`la ezen bir sürüm de
 * yeşil koşardı — kart yalnız "Sorulmadı" derdi, kimse arıza aramazdı; ama o bayrak ters
 * yükümlülüğü (%0 KDV) açan bayrak, yani silinen şey vergi kararının dayanağı.
 *
 * VIES'in kendisi çağrılmıyor ve bu bir kaçamak değil: servis üye ülke sunucularına bağlı ve
 * "cevap veremiyorum" hâli ısmarlanamaz (ölçüldü 27.08 — Fransa'nın düğümü art arda beş sorguya
 * `MS_MAX_CONCURRENT_REQ` döndü, Almanya normal cevapladı). Sınanan şey ağ değil, cevabın ne
 * yazdığı. `checkEuVatNumber`in kendi okuması ayrı bir konu ve künyesinde ölçülmüş.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const olusturulan: string[] = [];

/** Damgalı B2B kaydı — kural yaşı okuduğu için başlangıç hâli sınamanın parçası. */
async function newProfile(vat: { number: string | null; valid: boolean | null; checkedAt: string | null }) {
  const profile = await profiles.insert({
    roles: ['customer'],
    type: 'company',
    name: `KDV Tazeleme ${stamp}`,
    email: `kdv-${stamp}-${olusturulan.length}@example.test`,
    vatNumber: vat.number,
    vatNumberValid: vat.valid,
    vatNumberCheckedAt: vat.checkedAt,
  });
  olusturulan.push(profile.id);
  return profile;
}

const gunOnce = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Damgalar ANI karşılaştırılır, dizeyi değil: Postgres `timestamptz`i `+00:00` sonekiyle geri
 * veriyor, biz `Z` ile yazıyoruz — aynı an, farklı yazım. Dizeye bakan bir iddia, hiçbir şey
 * bozulmadan kırmızıya döner (yaşandı, ilk yazımda). Okuyan taraf zaten `Date.parse` ediyor.
 */
const ayniAn = (a: string | null, b: string | null) => a !== null && b !== null && Date.parse(a) === Date.parse(b);

afterAll(async () => {
  await purgeTestData(db, { profileIds: olusturulan });
});

describe('refreshVatNumberCheck', () => {
  it('KESİN cevap yazılır ve DAMGALANIR — kart artık bugünün cevabını gösterir', async () => {
    const profile = await newProfile({ number: 'DE811234567', valid: null, checkedAt: null });

    const sonuc = await refreshVatNumberCheck(db, profile, async () => true);
    expect(sonuc.valid).toBe(true);
    expect(sonuc.refreshed).toBe(true);
    expect(sonuc.checkedAt).not.toBeNull();

    // Dönüş değeri yetmez: bayrak VERGİ kararını besliyor, yani satırın kendisi değişmiş olmalı.
    const yazilan = await profiles.getById(profile.id);
    expect(yazilan?.vatNumberValid).toBe(true);
    expect(ayniAn(yazilan?.vatNumberCheckedAt ?? null, sonuc.checkedAt)).toBe(true);
  });

  it('numara İPTAL olmuşsa `false` da yazılır — tazeleme tek yöne çalışmaz', async () => {
    const profile = await newProfile({ number: 'DE811234567', valid: true, checkedAt: gunOnce(200) });

    const sonuc = await refreshVatNumberCheck(db, profile, async () => false);
    expect(sonuc.valid).toBe(false);
    expect((await profiles.getById(profile.id))?.vatNumberValid).toBe(false);
  });

  it('SORULAMADI hiçbir şeyi silmez — eski doğrulama damgasıyla birlikte durur', async () => {
    const eskiDamga = gunOnce(120);
    const profile = await newProfile({ number: 'FR81812345678', valid: true, checkedAt: eskiDamga });

    const sonuc = await refreshVatNumberCheck(db, profile, async () => null);
    expect(sonuc).toMatchObject({ valid: true, refreshed: false });
    // Elimizdeki damga OLDUĞU GİBİ geri veriliyor — kapı onu okumadı, dokunmadı.
    expect(ayniAn(sonuc.checkedAt, eskiDamga)).toBe(true);

    const yazilan = await profiles.getById(profile.id);
    expect(yazilan?.vatNumberValid).toBe(true);
    expect(ayniAn(yazilan?.vatNumberCheckedAt ?? null, eskiDamga)).toBe(true);
  });

  it('numarası OLMAYAN kayıtta servise hiç gidilmez', async () => {
    const profile = await newProfile({ number: null, valid: null, checkedAt: null });

    let soruldu = false;
    const sonuc = await refreshVatNumberCheck(db, profile, async () => {
      soruldu = true;
      return true;
    });

    expect(soruldu).toBe(false);
    expect(sonuc).toMatchObject({ valid: null, checkedAt: null, refreshed: false });
  });
});
