import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, UserProfileService, VehicleService, WarehouseService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { startCourierDay } from './day';
import { vehicleWarehouseOf } from './van-stock';

/*
  ═══ ARAÇ KİMLİĞİ ↔ ARAÇ DEPOSU (21.249 · kullanıcı kararı 04.09) ═════════════════════════════

  Sistemde İKİ ayrı "araç" var ve 04.09'a kadar birbirlerine hiçbir yerden bağlı değillerdi:

    · `vehicle` satırı — ruhsat/künye tarafı: plaka, okunur ad, soğuk zincir ölçüm beklentisi.
      Seferin seçtiği araç budur (`delivery_run.vehicle_id`).
    · `warehouse` satırı, türü `vehicle` — MALIN durduğu yer: yükleme, serbest ürün, kapıda satış
      ve akşam dönüşü hep buraya yazılıyor.

  İkisi arasında ne yabancı anahtar vardı ne kolon. Malın hangi araçtan çıkacağını seferin aracı
  DEĞİL, kuryenin profilindeki depo kapsam dizisi belirliyordu: `vehicleWarehouseOf` o diziyi
  tarayıp türü araç olan İLK satırı alıyordu. Yani sistem seçilen aracı kaydediyor ama
  kullanmıyordu.

  ── NİÇİN HİÇBİR TEST GÖRMEDİ ───────────────────────────────────────────────────────────────
  Testler doğruydu ve yeşildi: var olan tek kural *"kapsamdaki tesisleri atla, aracı bul"*du ve o
  kural sınanıyordu (`van-stock.test`). Kaçan şey bozuk bir kural değil, HİÇ VERİLMEMİŞ bir
  karardı — "kapsamda iki araç varsa hangisi" sorusunun cevabı kodda yazılı değildi, dizinin
  sırasından düşüyordu. Yazılmamış bir kararın testi de olamaz.
  İkinci sebep fikstürlerdeydi: kurye fikstürlerinin HEPSİNDE kapsamda tam bir araç var, yani
  belirsizliğin doğduğu kurulum hiç kurulmuyor. Bu dosya tam olarak onu kuruyor.

  ── BU DOSYANIN ÇİVİLEDİĞİ ÜÇ KARAR ─────────────────────────────────────────────────────────
   1. Araç deposu ARACINI söyler (`warehouse.vehicle_id`) — bağ veride, tahminde değil.
   2. Stok SEFERİN aracından çözülür, kapsam sırasından değil.
   3. Araçsız seferde araç deposu YOKTUR — sessizce başka bir araca düşmez (CLAUDE §1: ölçülemeyen
      değer uydurulmaz).
*/

const db = serviceDb();
const stamp = Date.now();

let facilityId: string;
/** Kuryenin kapsamındaki İKİ araç deposu — arızanın görünmesi için gereken en küçük kurulum. */
let vanAId: string;
let vanBId: string;
let vehicleAId: string;
let vehicleBId: string;
let courierId: string;
let zoneId: string;
/** İkinci rota — "rota+gün başına tek sefer" (K3) kuralı yüzünden araçsız kurye kendi rotasını ister. */
let ikinciZoneId: string;

beforeAll(async () => {
  facilityId = (await createTestWarehouse(db)).id;

  const vehicles = new VehicleService(db);
  const [vehicleA, vehicleB] = await Promise.all([
    vehicles.insert({ plate: `VB-A-${stamp}`, label: 'Araç A', warehouseId: facilityId }),
    vehicles.insert({ plate: `VB-B-${stamp}`, label: 'Araç B', warehouseId: facilityId }),
  ]);
  vehicleAId = vehicleA.id;
  vehicleBId = vehicleB.id;

  /* Her araç deposu KENDİ aracını gösteriyor. Bugün bu kolon yok; ilk test tam olarak onu söylüyor. */
  const warehouses = new WarehouseService(db);
  const [vanA, vanB] = await Promise.all([
    warehouses.insert({
      code: `TVA-${stamp % 100000}`, name: `Araç A deposu ${stamp}`, kind: 'vehicle',
      homeWarehouseId: facilityId, vehicleId: vehicleAId,
    }),
    warehouses.insert({
      code: `TVB-${stamp % 100000}`, name: `Araç B deposu ${stamp}`, kind: 'vehicle',
      homeWarehouseId: facilityId, vehicleId: vehicleBId,
    }),
  ]);
  vanAId = vanA.id;
  vanBId = vanB.id;

  const profiles = new UserProfileService(db);
  const courier = await profiles.insert({ name: `Çift araçlı kurye ${stamp}`, email: `cift-${stamp}@example.test` });
  courierId = courier.id;
  /* KAPSAM SIRASI BİLEREK "YANLIŞ": araç B önce yazılı. Bugünkü çözüm diziyi baştan tarayıp ilk
     aracı aldığı için B'yi seçer; doğru cevap ise seferin aracı olan A'dır. Sıra tesadüfe
     bırakılsaydı test bazen kendiliğinden geçerdi ve hiçbir şey kanıtlamazdı. */
  await profiles.setRoles(courierId, ['courier'], [facilityId, vanBId, vanAId]);

  const zones = new DeliveryZoneService(db);
  zoneId = (await zones.insert({
    name: `Araç bağı rotası ${stamp}`, warehouseId: facilityId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
  ikinciZoneId = (await zones.insert({
    name: `Araç bağı ikinci rota ${stamp}`, warehouseId: facilityId, weekdays: [1, 2, 3, 4, 5, 6, 7],
  })).id;
});

afterAll(async () => {
  await purgeTestData(db, {
    profileIds: [courierId],
    warehouseIds: [facilityId, vanAId, vanBId],
    vehicleIds: [vehicleAId, vehicleBId],
  });
});

describe('araç kimliği ↔ araç deposu', () => {
  it('ARAÇ DEPOSU ARACINI SÖYLER — bağ veride durur, tahmin edilmez', async () => {
    const van = await new WarehouseService(db).getById(vanAId);

    /* Bağ olmadan "bu aracın malı hangisi" sorusunun cevabı yok: sıcaklığı bozulan araçta hangi
       partilerin durduğu da aynı sebeple bilinemiyordu (ölçü `vehicle`de, mal `warehouse`da). */
    expect(van?.vehicleId).toBe(vehicleAId);
  });

  it('STOK SEFERİN ARACINDAN çözülür — kapsam sırasından DEĞİL', async () => {
    /* Kurye A aracıyla sefer kuruyor. Kapsamında iki araç deposu var ve B önce yazılı. */
    const start = await startCourierDay(db, { courierId, zoneId, vehicleId: vehicleAId, depart: false });
    expect(start.status).toBe('ok');

    const resolved = await vehicleWarehouseOf(db, { courierId });

    /* Arızanın kendisi: bugün B dönüyor. Kurye A'yı seçmişken serbest ürün B'nin stoğundan
       düşüyor, kapıda satış B'den satıyor ve hiçbir yerde hata çıkmıyor. */
    expect(resolved).toBe(vanAId);
    expect(resolved).not.toBe(vanBId);
  });

  it('ARAÇSIZ SEFERDE araç deposu YOKTUR — sessizce başka araca düşmez', async () => {
    /* Araç seçmek isteğe bağlı (kurulum eksikse kurye kilitlenmesin — `day.ts` künyesi). Ama
       araçsız seferde araç deposu da yoktur: kapılar `no_vehicle` döner ve ekran sebebini yazar.
       Bugün kapsamdaki ilk araç sessizce devreye giriyor, yani kurye adını koymadığı bir aracın
       malını satabiliyor. */
    const aracsizKurye = await new UserProfileService(db).insert({
      name: `Araçsız sefer kuryesi ${stamp}`, email: `aracsiz-${stamp}@example.test`,
    });
    await new UserProfileService(db).setRoles(aracsizKurye.id, ['courier'], [facilityId, vanAId]);

    const start = await startCourierDay(db, { courierId: aracsizKurye.id, zoneId: ikinciZoneId, depart: false });
    expect(start.status).toBe('ok');

    expect(await vehicleWarehouseOf(db, { courierId: aracsizKurye.id })).toBeNull();

    await purgeTestData(db, { profileIds: [aracsizKurye.id] });
  });
});
