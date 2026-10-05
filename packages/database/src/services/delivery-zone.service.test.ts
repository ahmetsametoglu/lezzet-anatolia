import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Business, Country } from '@lezzet/types';
import { serviceDb } from '../index';
import { createTestWarehouse, purgeTestData, testPostalCode } from '../testing';
import { DeliveryZonePostalCodeService, DeliveryZoneService } from './delivery-zone.service';
import { WarehouseService } from './warehouse.service';

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

describe('işe göre bölge', () => {
  const zones = new DeliveryZoneService(db);
  const codes = new DeliveryZonePostalCodeService(db);
  const warehouses = new WarehouseService(db);
  const created: string[] = [];

  afterAll(async () => {
    await purgeTestData(db, { warehouseIds: created });
  });

  const depo = async (business: Business, countryCode: Country = 'FR') => {
    const row = await createTestWarehouse(db, { countryCode });
    created.push(row.id);
    return business === 'lezzet' ? row : warehouses.update({ id: row.id, business });
  };
  const bolge = (warehouseId: string) => zones.insert({ name: `İş bölgesi ${Date.now()}`, warehouseId, weekdays: [2] });
  const kodla = (zoneId: string, postalCode: string) => zones.replacePostalCodes(zoneId, [{ country: 'FR', postalCode }]);
  const islerOf = async (postalCode: string) => (await codes.listByCodes([postalCode])).map((row) => row.business).sort();

  it('bir posta kodu her işte en çok bir bölgededir; iki iş aynı kodu ayrı bölgede tutar', async () => {
    const lezzet = await depo('lezzet');
    const qualite = await depo('qualite');
    const kod = testPostalCode();
    await kodla((await bolge(lezzet.id)).id, kod);
    await kodla((await bolge(qualite.id)).id, kod);

    await expect(kodla((await bolge(lezzet.id)).id, kod)).rejects.toThrow(/delivery_zone_postal_code_pkey/);
    expect(await islerOf(kod)).toEqual(['lezzet', 'qualite']);
  });

  it('bölge başka işin deposuna taşınınca kodları o işi alır; o işte kodu tutan bölge varsa taşıma reddedilir', async () => {
    const lezzet = await depo('lezzet');
    const qualite = await depo('qualite');
    const [tek, ortak] = [testPostalCode(), testPostalCode()];
    const tasinan = await bolge(lezzet.id);
    await kodla(tasinan.id, tek);
    await zones.update({ id: tasinan.id, warehouseId: qualite.id });
    expect(await islerOf(tek)).toEqual(['qualite']);

    const cakisan = await bolge(lezzet.id);
    await kodla(cakisan.id, ortak);
    await kodla((await bolge(qualite.id)).id, ortak);
    await expect(zones.update({ id: cakisan.id, warehouseId: qualite.id })).rejects.toThrow(/delivery_zone_postal_code_pkey/);
  });

  it('deponun işi değişince bölgelerinin kodları izler; öteki işte aynı kod tutuluyorsa değişiklik reddedilir', async () => {
    const izleyen = await depo('lezzet');
    const kod = testPostalCode();
    await kodla((await bolge(izleyen.id)).id, kod);
    await warehouses.update({ id: izleyen.id, business: 'qualite' });
    expect(await islerOf(kod)).toEqual(['qualite']);

    const cakisan = await depo('lezzet');
    const qualite = await depo('qualite');
    const ortak = testPostalCode();
    await kodla((await bolge(cakisan.id)).id, ortak);
    await kodla((await bolge(qualite.id)).id, ortak);
    await expect(warehouses.update({ id: cakisan.id, business: 'qualite' })).rejects.toThrow(/delivery_zone_postal_code_pkey/);
  });

  it('QUALITE deposu kargo çıkış deposu olamaz', async () => {
    const qualite = await depo('qualite', 'DE');
    await expect(warehouses.update({ id: qualite.id, shipsOnline: true })).rejects.toThrow(/warehouse_qualite_never_ships/);
  });
});
