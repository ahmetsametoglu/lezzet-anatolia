import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { addAddress, deleteAddress, setDefaultAddress, updateAddress } from './addresses';

/**
 * Hesap sayfasının adres yazma kapısı (08.5).
 *
 * Sınanan iki şey de SESSİZCE bozulabilecek türden:
 *   **sahiplik** — başkasının adresine dokunmak, ekranda hiçbir iz bırakmaz;
 *   **varsayılan devri** — varsayılan adres silinince yerine kimse geçmezse teslimat yeri
 *   göstergesi boşalır ve müşteri bunu ancak checkout'ta fark eder.
 */
const db = serviceDb();
const addresses = new AddressService(db);
const stamp = Date.now();

let customerId: string;
let otherId: string;
const createdProfiles: string[] = [];

beforeEach(async () => {
  // Her senaryo TEMİZ bir müşteriyle başlar: adres kümesi testin kendi kurduğu şeydir, önceki
  // senaryodan kalan bir satır "en yeni hangisi" sorusunu sessizce değiştirirdi.
  const profiles = new UserProfileService(db);
  const me = await profiles.insert({ name: 'Adres testi', email: `adres-${stamp}-${createdProfiles.length}@ornek.test` });
  const other = await profiles.insert({ name: 'Başkası', email: `baska-${stamp}-${createdProfiles.length}@ornek.test` });
  customerId = me.id;
  otherId = other.id;
  createdProfiles.push(me.id, other.id);
});

afterAll(async () => {
  for (const id of createdProfiles) await db.from('address').delete().eq('customer_id', id);
  await purgeTestData(db, { profileIds: createdProfiles });
});

/** Sıra ÖNEMLİ: "en yeni" ölçütü `created_at` ile çözülüyor, damga da öyle ayrışmalı. */
async function ekle(city: string): Promise<string> {
  // Alıcı + telefon 22.08'den beri ZORUNLU (kullanıcı kararı): adres kaydının kendisi "burada kim
  // teslim alır" sorusunun cevabı. Fikstür de o asgariyi taşımalı, yoksa test gerçek yazma yolunun
  // giremeyeceği bir satırı kurar.
  await addAddress(customerId, { recipient: 'Ayşe Yılmaz', phone: '+33612345678', line1: `${city} sokak`, postalCode: '67000', city });
  const list = await addresses.listByCustomer(customerId);
  return list.find((a) => a.city === city)!.id;
}

describe('adres yazma kapısı', () => {
  it('ilk adres kendiliğinden VARSAYILAN olur', async () => {
    await ekle('Strasbourg');

    const list = await addresses.listByCustomer(customerId);
    expect(list).toHaveLength(1);
    expect(list[0]!.isDefault).toBe(true);
  });

  it('varsayılan adres silinince EN YENİ adres varsayılan olur', async () => {
    const ilk = await ekle('Strasbourg');
    await ekle('Lingolsheim');
    const enYeni = await ekle('Schiltigheim');
    // Varsayılan hâlâ ilk adres; ikisi de sonradan eklendi ama bayrağı devralmadı.
    await setDefaultAddress(customerId, ilk);

    await deleteAddress(customerId, ilk);

    const list = await addresses.listByCustomer(customerId);
    expect(list).toHaveLength(2);
    // En yeni devraldı — en eskiye dönmek müşteriyi taşınmadan önceki evine göndermek olurdu.
    expect(list.find((a) => a.id === enYeni)?.isDefault).toBe(true);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it('varsayılan OLMAYAN adres silinince devir olmaz', async () => {
    const ilk = await ekle('Strasbourg');
    const ikinci = await ekle('Lingolsheim');

    await deleteAddress(customerId, ikinci);

    const list = await addresses.listByCustomer(customerId);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(ilk);
    expect(list[0]!.isDefault).toBe(true);
  });

  it('son adres de silinebilir — boş listede varsayılan aranmaz', async () => {
    const tek = await ekle('Strasbourg');

    await expect(deleteAddress(customerId, tek)).resolves.toBeUndefined();
    expect(await addresses.listByCustomer(customerId)).toHaveLength(0);
  });

  it('BAŞKASININ adresine hiçbir eylem işlemez — varlığı da sızmaz', async () => {
    const benim = await ekle('Strasbourg');

    // Üç eylemin üçü de aynı cevabı verir: "bulunamadı". "Sizin değil" demek, kimliğin
    // gerçekten var olduğunu doğrulamak olurdu.
    await expect(deleteAddress(otherId, benim)).rejects.toThrow('Adres bulunamadı');
    await expect(setDefaultAddress(otherId, benim)).rejects.toThrow('Adres bulunamadı');
    await expect(
      updateAddress(otherId, benim, { recipient: 'Ayşe Yılmaz', phone: '+33612345678', line1: 'Ele geçirildi', postalCode: '75000', city: 'Paris' }),
    ).rejects.toThrow(
      'Adres bulunamadı',
    );

    // Ve satır gerçekten dokunulmamış.
    const list = await addresses.listByCustomer(customerId);
    expect(list).toHaveLength(1);
    expect(list[0]!.city).toBe('Strasbourg');
  });

  it('güncelleme VARSAYILAN bayrağını taşımaz — o ayrı bir karardır', async () => {
    const ilk = await ekle('Strasbourg');
    const ikinci = await ekle('Lingolsheim');

    // `isDefault` geçirilse bile yok sayılır: tek satırı işaretlemek öbürlerini düşürmez ve
    // ortada iki varsayılan kalırdı.
    await updateAddress(customerId, ikinci, {
      recipient: 'Ayşe Yılmaz',
      phone: '+33612345678',
      line1: 'Yeni sokak',
      postalCode: '67000',
      city: 'Lingolsheim',
      isDefault: true,
    });

    const list = await addresses.listByCustomer(customerId);
    expect(list.find((a) => a.id === ilk)?.isDefault).toBe(true);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list.find((a) => a.id === ikinci)?.line1).toBe('Yeni sokak');
  });
});
