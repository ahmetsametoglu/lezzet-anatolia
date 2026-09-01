import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AddressService, UserProfileService, WarehouseService, serviceDb } from '../index';
import { createTestWarehouse, purgeTestData } from '../testing';

/**
 * **Koordinat kısıtları veride mi** (11.9) — `address_geo_point` · `address_geo_meta` ·
 * `warehouse_geo_point`.
 *
 * Bu üç kural uygulama katmanında da yazılı (`resolveAddressPoint` bölünemez bir künye döndürür) ve
 * tam da bu yüzden sınanmaları gerekiyor: **uygulamada duran bir kural, ikinci bir yazan el
 * doğduğu gün sessizce delinir.** Operasyon panelinden girilen bir adres, bir betik, bir migration
 * — hepsi aynı tablodan geçer, hiçbiri `resolveAddressPoint`ten geçmek zorunda değildir.
 *
 * Yarım bir noktanın zararı somut: `lat` dolu `lng` boş bir satır, okuyan tarafta `Number(null) = 0`
 * ile Gine Körfezi'ne düşer ve hiçbir tip bunu yakalamaz (`ban.schema.ts`in kendi uyarısı). Kademesiz
 * bir nokta ise kaba ölçümü kesinmiş gibi okutur — arıza GÖRÜNMEZ kalır (`CLAUDE §1`).
 */
const db = serviceDb();
const addresses = new AddressService(db);

const stamp = Date.now();
let customerId: string;
let warehouseId: string;
const createdProfiles: string[] = [];
const createdWarehouses: string[] = [];

beforeAll(async () => {
  const customer = await new UserProfileService(db).insert({
    name: 'Kısıt Müşterisi',
    email: `kisit-${stamp}@example.test`,
  });
  customerId = customer.id;
  createdProfiles.push(customer.id);
  warehouseId = (await createTestWarehouse(db)).id;
  createdWarehouses.push(warehouseId);
});

afterAll(async () => {
  await purgeTestData(db, { profileIds: createdProfiles, warehouseIds: createdWarehouses });
});

const base = {
  customerId: '',
  recipient: 'Kısıt Alıcısı',
  phone: '+33600000002',
  line1: '3 rue de la Contrainte',
  postalCode: '67000',
  city: 'Strasbourg',
};

describe('adres koordinatı · veri kısıtları', () => {
  it('YARIM nokta reddedilir — enlem var boylam yok', async () => {
    // Zod bunu geçirir (iki bağımsız nullable alan) ve geçirmesi de doğru: çapraz alan kuralı
    // TİPİN değil VERİNİN işidir. Kapı burada.
    await expect(addresses.insert({ ...base, customerId, lat: 48.58 })).rejects.toThrow(/address_geo_point/);
  });

  it('YARIM nokta reddedilir — boylam var enlem yok', async () => {
    await expect(addresses.insert({ ...base, customerId, lng: 7.74 })).rejects.toThrow(/address_geo_point/);
  });

  it('NOKTASIZ künye reddedilir — kademe tek başına yazılamaz', async () => {
    /*
      "Kaynağı BAN, kademesi kapı numarası, ama koordinat yok" satırı bir çelişkidir: künye ölçümün
      inceliğini anlatır, ölçüm yoksa anlatacak bir şey de yoktur. Kısıt olmasaydı böyle bir satır
      okuyan tarafta "çözülmüş adres" diye sayılırdı.
    */
    await expect(
      addresses.insert({ ...base, customerId, geoPrecision: 'housenumber', geoSource: 'ban' }),
    ).rejects.toThrow(/address_geo_meta/);
  });

  it('noktasız DAMGA da reddedilir — `geoAt` ölçümün anıdır', async () => {
    await expect(addresses.insert({ ...base, customerId, geoAt: new Date().toISOString() })).rejects.toThrow(
      /address_geo_meta/,
    );
  });

  it('TAM künye kabul edilir — kısıt doğruyu da geçirmeli', async () => {
    // Pozitif kanıt olmadan yukarıdaki dört ret, "kolonlar hiç yazılamıyor" ile aynı görünürdü.
    const row = await addresses.insert({
      ...base,
      customerId,
      lat: 48.5839,
      lng: 7.7455,
      geoPrecision: 'housenumber',
      geoSource: 'ban',
      geoAt: new Date().toISOString(),
      geoCheckedAt: new Date().toISOString(),
    });

    expect(Number(row.lat)).toBeCloseTo(48.5839, 5);
    expect(row.geoPrecision).toBe('housenumber');
  });

  it('DENEME SAYACI noktasız satırda serbesttir — "denedik, olmadı" bir çelişki değil', async () => {
    // `geo_checked_at` + `geo_attempts` künye kısıtının DIŞINDA tutuldu ve bu bilinçli: ikisi
    // ölçümü değil, ölçme GİRİŞİMİNİ anlatır. Kısıta dâhil olsalardı tarama kuyruğu hiç
    // işaretlenemezdi.
    const row = await addresses.insert({
      ...base,
      customerId,
      geoCheckedAt: new Date().toISOString(),
      geoAttempts: 2,
    });

    expect(row.lat).toBeNull();
    expect(row.geoAttempts).toBe(2);
  });
});

describe('depo koordinatı · veri kısıtı', () => {
  it('deponun YARIM noktası reddedilir', async () => {
    // Depo turun ÇIPASI: yarım bir nokta burada, bütün seferin sırasını sessizce bozar.
    await expect(new WarehouseService(db).update({ id: warehouseId, lat: 48.58 })).rejects.toThrow(
      /warehouse_geo_point/,
    );
  });

  it('deponun TAM noktası yazılır ve geri okunur', async () => {
    const row = await new WarehouseService(db).update({ id: warehouseId, lat: 48.578, lng: 7.742 });

    expect(Number(row.lat)).toBeCloseTo(48.578, 5);
    expect(Number(row.lng)).toBeCloseTo(7.742, 5);
  });

  it('noktası SÖKÜLEBİLİR — ikisi birlikte boşalır', async () => {
    const row = await new WarehouseService(db).update({ id: warehouseId, lat: null, lng: null });

    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
  });
});
