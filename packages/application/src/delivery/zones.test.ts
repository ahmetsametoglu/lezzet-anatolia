import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, WarehouseService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData, testPostalCode } from '@lezzet/database/testing';
import { listPublicDeliveryAreas } from './zones';

/**
 * Teslim bölgeleri listesi görüntüleyenin işinindir: QUALITE'nin bölgesindeki kod Lezzet müşterisine "aracımız buraya gider" diye
 * gösterilmez (docs/feature/iki-is.md, karar 9).
 */
const db = serviceDb();
const stamp = Date.now();
const code = testPostalCode();
let qualiteDepo: string;

beforeAll(async () => {
  qualiteDepo = (await createTestWarehouse(db, { label: 'BLQ' })).id;
  await new WarehouseService(db).update({ id: qualiteDepo, business: 'qualite' });
  const zones = new DeliveryZoneService(db);
  const zone = await zones.insert({ name: `QUALITE bölge listesi ${stamp}`, warehouseId: qualiteDepo, weekdays: [1, 2, 3, 4, 5] });
  await zones.replacePostalCodes(zone.id, [{ country: 'FR', postalCode: code }]);
});

afterAll(async () => {
  await purgeTestData(db, { warehouseIds: [qualiteDepo] });
});

const codesOf = (list: Awaited<ReturnType<typeof listPublicDeliveryAreas>>) =>
  list.areas.flatMap((area) => area.places.flatMap((place) => place.codes));

describe('teslim bölgeleri listesi', () => {
  it("QUALITE'nin bölgesi yalnız QUALITE'nin listesinde durur", async () => {
    expect(codesOf(await listPublicDeliveryAreas(db, 'qualite'))).toContain(code);
    expect(codesOf(await listPublicDeliveryAreas(db, 'lezzet'))).not.toContain(code);
  });
});
