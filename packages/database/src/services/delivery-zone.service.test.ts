import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../index';
import { createTestWarehouse, purgeTestData } from '../testing';

const db = serviceDb();
let warehouseId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
});

afterAll(async () => {
  await purgeTestData(db, { warehouseIds: [warehouseId] });
});

describe('teslimat bölgesi — veri kısıtı', () => {
  // Form tek yazma yolu değil; günsüz rota hiçbir sefere düşmeyeceği için kural veride durmalı.
  it('günü olmayan rota veritabanında reddedilir', async () => {
    const { error } = await db.from('delivery_zone').insert({ name: `Günsüz rota ${Date.now()}`, warehouse_id: warehouseId, weekdays: [] });

    expect(error?.code).toBe('23514'); // check_violation
  });
});
