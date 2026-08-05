import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { UserProfileService } from './user-profile.service';

/**
 * GDPR silme (05.08) — `anonymize_customer` (0037).
 *
 * Bu dosya bir özelliği değil, **müşteriye verilmiş bir sözü** çiviliyor: gizlilik metni "hesabınızı
 * silebilirsiniz" ve "sipariş kayıtları yasal süre boyunca saklanır" diyor. İkisi aynı anda doğru
 * olmak zorunda; biri bozulursa metin yalan söyler ve hiçbir yerde hata vermez.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const stamp = Date.now();
const createdIds: string[] = [];

// Telefon KİMLİK ANAHTARIDIR (kısmi unique): damga tek başına yetmez, aynı milisaniyede açılan iki
// profil çakışır. Sayaç damgaya ekleniyor.
let sira = 0;

async function createCustomer(ad: string) {
  sira += 1;
  const p = await profiles.insert({
    name: `${ad} ${stamp}`,
    email: `${ad}.${stamp}@ornek.fr`,
    phone: `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`,
  });
  createdIds.push(p.id);
  return p;
}

beforeAll(async () => {
  await createCustomer('anonim-hazirlik');
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdIds });
});

describe('kimlik boşaltılır, satır KALIR', () => {
  it('ad, e-posta ve telefon gider; damga düşer', async () => {
    const p = await createCustomer('kimlik');
    await profiles.anonymize(p.id);

    const sonra = await profiles.getById(p.id);
    // Satırın kendisi duruyor: `order` buna `restrict` ile bağlı, silinemez ve silinmemeli.
    expect(sonra).not.toBeNull();
    expect(sonra!.name).toBe('');
    expect(sonra!.email).toBeNull();
    expect(sonra!.phone).toBeNull();
    expect(sonra!.anonymizedAt).not.toBeNull();
  });

  it('ticari yetkiler kapanır — kimliksiz kayda açık kredi bırakılmaz', async () => {
    const p = await createCustomer('yetki');
    await profiles.update({ id: p.id, creditEnabled: true, creditLimitCents: 50_000 });

    await profiles.anonymize(p.id);

    const sonra = await profiles.getById(p.id);
    expect(sonra!.creditEnabled).toBe(false);
    expect(sonra!.creditLimitCents).toBeNull();
    expect(sonra!.codAllowed).toBe(false);
  });

  it('adres SİLİNİR — teslimat için tutuluyordu, siparişteki anlık görüntüsü ayrı kayıt', async () => {
    const p = await createCustomer('adres');
    await db.from('address').insert({
      customer_id: p.id,
      label: 'Ev',
      line1: '46 rue des Prés',
      postal_code: '67380',
      city: 'Lingolsheim',
      country: 'FR',
    });

    await profiles.anonymize(p.id);

    const { data } = await db.from('address').select('id').eq('customer_id', p.id);
    expect(data).toEqual([]);
  });
});

describe('kapılar', () => {
  it('ikinci çağrı sessizce çıkar — silme talebi iki kez işlenirse zarar vermemeli', async () => {
    const p = await createCustomer('idempotent');
    await profiles.anonymize(p.id);
    const ilk = (await profiles.getById(p.id))!.anonymizedAt;

    await expect(profiles.anonymize(p.id)).resolves.toBeUndefined();
    // Damga İLK silmenin tarihidir: ikinci çağrı onu ileri sarsaydı denetimde "ne zaman silindi"
    // sorusu yanlış cevaplanırdı.
    expect((await profiles.getById(p.id))!.anonymizedAt).toBe(ilk);
  });

  it('PERSONEL bu kapıdan geçmez — istihdam kaydı müşteri talebiyle silinmez', async () => {
    const p = await createCustomer('personel');
    await profiles.setRoles(p.id, ['accounting']);

    // Sessizce atlamak DEĞİL, hata: sessiz atlama çağıranın "sildim" sanmasına yol açar.
    await expect(profiles.anonymize(p.id)).rejects.toThrow(/personel/i);
    expect((await profiles.getById(p.id))!.anonymizedAt).toBeNull();
  });

  it('olmayan profil hata verir', async () => {
    await expect(profiles.anonymize('00000000-0000-0000-0000-000000000000')).rejects.toThrow();
  });
});
