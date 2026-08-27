import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { StorageAreaService, VehicleService } from './storage-point.service';
import { TemperatureLogService } from './temperature-log.service';

/**
 * Sıcaklık kaydı (06.7 · noktalar 19.28) — hijyen denetiminin ilk istediği veri.
 *
 * Bu testler `stock-adjustment.test.ts`in içindeydi ve orada durmasının bir sebebi yoktu: migration
 * tarafındaki eski bir "aile içi birleştirme" (02.11) tesadüfen testleri de aynı dosyaya toplamıştı.
 * Hareket defteri işi (06.14) o dosyayı zaten söktü; sıcaklık kaydı kendi evine taşındı.
 */
const db = serviceDb();
const temps = new TemperatureLogService(db);
const areas = new StorageAreaService(db);
const vehicles = new VehicleService(db);

let warehouseId: string;
let storageAreaId: string;
let vehicleId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'SIC' })).id;
  const stamp = Date.now();
  storageAreaId = (await areas.insert({ warehouseId, name: `Dolap ${stamp}`, kind: 'frozen' })).id;
  vehicleId = (await vehicles.insert({ plate: `T-${stamp}`, warehouseId })).id;
});

// Test kendi zeminini toplar — yerel veritabanında çöp satır bırakmaz (silme sırası: cleanup.ts).
afterAll(async () => {
  await purgeTestData(db, {
    storageAreaIds: [storageAreaId],
    vehicleIds: [vehicleId],
    warehouseIds: [warehouseId],
  });
});

describe('sıcaklık kaydı (06.7 · noktalar 19.28)', () => {
  it('kayıt girilir, NOKTA + tarih aralığıyla listelenir (en yeni önce)', async () => {
    await temps.insert({ warehouseId, storageAreaId, temperatureC: -18.5 });
    await temps.insert({ warehouseId, storageAreaId, temperatureC: -19.2 });
    // Araç kaydı aynı depoya yazılır (kaydın alındığı tesis) ama AYRI noktadır — süzgeç ikisini
    // karıştırmamalı, yoksa "bu dolabın geçmişi" sorusu aracın ölçümünü de sayardı.
    await temps.insert({ warehouseId, vehicleId, temperatureC: -15 });

    const page = await temps.list({ storageAreaId, limit: 10 });
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]!.temperatureC).toBe(-19.2); // en yeni önce

    const future = await temps.list({ storageAreaId, from: new Date(Date.now() + 60_000) });
    expect(future.rows).toHaveLength(0);
  });

  it('NOKTASIZ kayıt reddedilir — ölçümün nerede alındığı bilinmeden kayıt bir kanıt değildir', async () => {
    await expect(temps.insert({ warehouseId, temperatureC: -18 })).rejects.toThrow();
  });

  it('İKİ noktalı kayıt reddedilir — tek ölçüm tek yerde alınır', async () => {
    await expect(temps.insert({ warehouseId, storageAreaId, vehicleId, temperatureC: -18 })).rejects.toThrow();
  });
});
