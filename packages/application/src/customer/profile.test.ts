import { afterAll, describe, expect, it } from 'vitest';
import { UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { updateCustomerProfile } from './profile';

/**
 * **Müşteri profil güncellemesi** (21.14c) — web hesap formuyla TEK kural olduğunun kanıtı:
 *   · ad boşa İNDİRİLEMEZ (adsız kart siparişin kime gittiğini söyleyemez),
 *   · telefon E.164'e iner ("06…" → "+33 6…"), çözülemeyen numara sessizce düşmez,
 *   · numara ÇAKIŞMASI DİYE BİR ŞEY YOK (04.10): bu kolon iletişim numarasıdır, kimlik anahtarı
 *     değil — aynı hattı iki müşteri taşıyabilir,
 *   · `phone: null` numarayı siler; gönderilmeyen alana dokunulmaz.
 *
 * Paylaşılan DB (CLAUDE.md §4b): satırlar damgalı (`profil-guncelleme-` öneki + Date.now),
 * hiçbir iddia küresel sayıya bakmaz; temizlik `purgeTestData` ile.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const mail = (tag: string) => `profil-guncelleme-${tag}-${stamp}@ornek.test`;
/** Bu dosyanın açtığı satırlar — purge kimlikle çalışır, önekle değil. */
const createdIds: string[] = [];
async function createProfile(tag: string, phone?: string) {
  const row = await profiles.insert({ email: mail(tag), name: tag === 'ret' ? 'Dokunulmaz' : tag === 'sahip' ? 'Sahip' : tag === 'talip' ? 'Talip' : 'İlk Ad', type: 'individual', ...(phone ? { phone } : {}) });
  createdIds.push(row.id);
  return row;
}
/** Çakışmayacak yerel FR numaraları — damgadan türeyen son haneler. */
const phoneOf = (n: number) => `06 ${String(stamp).slice(-8, -4)} ${String((stamp + n) % 10000).padStart(4, '0')}`;

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdIds });
});

describe('müşteri profil güncellemesi', () => {
  it('ad kırpılır ve yazılır; telefon E.164 olarak iner; null telefon siler', async () => {
    const row = await createProfile('ana');

    const renamed = await updateCustomerProfile(db, { profileId: row.id, name: '  Yeni Ad  ', phone: phoneOf(1) });
    expect(renamed.status).toBe('ok');
    if (renamed.status !== 'ok') return;
    expect(renamed.profile.name).toBe('Yeni Ad');
    expect(renamed.profile.phone).toMatch(/^\+33[0-9]{9}$/);

    const cleared = await updateCustomerProfile(db, { profileId: row.id, phone: null });
    expect(cleared.status).toBe('ok');
    if (cleared.status !== 'ok') return;
    // Telefon silindi; DOKUNULMAYAN ad yerinde duruyor.
    expect(cleared.profile.phone).toBeNull();
    expect(cleared.profile.name).toBe('Yeni Ad');
  });

  it('boş ad ve çözülemeyen numara ADLI retlerdir — satıra hiçbir şey yazılmaz', async () => {
    const row = await createProfile('ret');

    expect((await updateCustomerProfile(db, { profileId: row.id, name: '   ' })).status).toBe('name_required');
    expect((await updateCustomerProfile(db, { profileId: row.id, phone: 'abc' })).status).toBe('phone_invalid');

    const untouched = await profiles.getById(row.id);
    expect(untouched?.name).toBe('Dokunulmaz');
    expect(untouched?.phone).toBeNull();
  });

  it('AYNI numarayı iki müşteri taşıyabilir — bu kolon iletişim numarasıdır (04.10)', async () => {
    // Kural TERSİNE döndü. Eskiden `phone_taken` diye adlı bir ret vardı ve dayanağı
    // `user_profiles_phone_key` tekil indeksiydi; o indeks kaldırıldı çünkü doğrulanmamış bir dizeyi
    // kimlik anahtarı sayıyordu — kayıtlı olmayan bir numara formdan önceden sahiplenilebiliyordu.
    // Kolon artık İLETİŞİM numarası ve paylaşılması meşru: aile telefonu, işyeri hattı, eş.
    // Kimlik anahtarının tekilliği `customer_phone`da (`customer-phone.test.ts`).
    const paylasilan = phoneOf(2);
    const ilk = await createProfile('sahip', paylasilan.replace(/\s/g, '').replace(/^0/, '+33'));
    const ikinci = await createProfile('ayni-hat');

    const outcome = await updateCustomerProfile(db, { profileId: ikinci.id, phone: paylasilan });
    expect(outcome.status).toBe('ok');
    // İkisi de aynı numarayı taşıyor ve ilkinin kaydına dokunulmadı.
    expect((await profiles.getById(ikinci.id))?.phone).toBe((await profiles.getById(ilk.id))?.phone);
  });
});
