import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, SettingsService, serviceDb } from '@lezzet/database';
import { settingsSnapshot, createTestWarehouse, purgeTestData, testPostalCode } from '@lezzet/database/testing';
import { resolveDelivery } from './delivery';

/**
 * Checkout teslimat çözümü (07.2) — DB + ayar + motor birlikte. "Hangi gün, kesim saati nasıl
 * işliyor" motorun birim testinde (`domain-core/delivery`); burada **bölge ve ayarın gerçekten
 * okunduğu** doğrulanır.
 */
const db = serviceDb();
const zones = new DeliveryZoneService(db);

const stamp = Date.now();
const rotaKodu = testPostalCode();
const createdZones: string[] = [];
// Bölge tek depoya bağlanır (DOMAIN §17) — testin kendi deposu, sonunda toplanıyor.
let warehouseId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  const zone = await zones.insert({
    name: `Test bölgesi ${stamp}`,
    warehouseId,
    weekdays: [2, 5], // Salı, Cuma
  });
  // Kodlar artık bölgenin dizi kolonunda değil kendi tablosunda; ülke de anahtarın parçası.
  await zones.replacePostalCodes(zone.id, [{ country: 'FR', postalCode: rotaKodu }]);
  createdZones.push(zone.id);
  SettingsService.invalidate();
});

afterAll(async () => {
  // Bölgeler de depoya bağlı ve purge sırayı biliyor — burada elle silinmesi gereken bir şey yok.
  await purgeTestData(db, { warehouseIds: [warehouseId] });
  SettingsService.invalidate();
});

const pazartesiSabah = new Date(2026, 6, 27, 9, 0);

describe('rota içi teslimat (07.2)', () => {
  it('posta kodu bölgeye düşüyorsa rota içi + yaklaşan günler gelir', async () => {
    const outcome = await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah });

    expect(outcome.deliveryType).toBe('route');
    expect(outcome.zoneId).toBe(createdZones[0]);
    expect(outcome.availableDates).toEqual(['2026-07-28', '2026-07-31', '2026-08-04']);
    expect(outcome.requiresDateChoice).toBe(true);
  });

  it('tek tarih önerildiğinde seçim sunulmaz', async () => {
    const outcome = await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah, dateCount: 1 });
    expect(outcome.requiresDateChoice).toBe(false);
    expect(outcome.availableDates).toHaveLength(1);
  });

  /**
   * Kesim ayardan okunur VE hangi güne ait olduğu da ayardan türer (kullanıcı kuralı 17.08):
   * hazırlık kapanışından önceyse aynı günün, sonraysa bir ÖNCEKİ günün saatidir.
   *
   * **An 12:00'den 09:00'a çekildi** ve sebebi kuralın kendisi: hazırlık 11:00'da kapanıyor, yani
   * 12:00'de gelen bir sipariş hiçbir kesim değeriyle o güne yetişmez — kesim 11:00'dan küçükse zaten
   * geçmiştir, büyükse önceki güne aittir. Testin üç dalı ayırt edebilmesi için an hazırlıktan önce
   * olmalı. Eski hâli varsayılan 16:00 ile "bugün hâlâ yetişir" bekliyordu; o beklenti kuralla
   * geçersizleşti (16:00 > 11:00 → önceki gün).
   */
  it('kesim saati AYARDAN okunur — saat de, AİT OLDUĞU GÜN de gün hesabını değiştirir', async () => {
    // Ayar KÜRESEL tekil: geri koyma okunan değere yapılır, sabite değil (CLAUDE.md §4b).
    const settings = settingsSnapshot(db);
    const saliSabah = new Date(2026, 6, 28, 9, 0); // Salı 09:00 — teslimat günü, hazırlıktan önce

    try {
      // Kesim 10:00: hazırlıktan (11:00) ÖNCE → aynı günün saati, ve henüz gelmedi → bugün yetişir.
      await settings.override('order_cutoff_time', '10:00');
      expect((await resolveDelivery({ postalCode: rotaKodu, now: saliSabah })).availableDates[0]).toBe('2026-07-28');

      // Kesim 08:00: yine aynı günün saati ama GEÇTİ → bugüne yetişmez, sonraki rota günü.
      await settings.override('order_cutoff_time', '08:00');
      expect((await resolveDelivery({ postalCode: rotaKodu, now: saliSabah })).availableDates[0]).toBe('2026-07-31');

      // Kesim 16:00: hazırlıktan SONRA → ÖNCEKİ günün saati; bu günün seferi dün kapandı.
      await settings.override('order_cutoff_time', '16:00');
      expect((await resolveDelivery({ postalCode: rotaKodu, now: saliSabah })).availableDates[0]).toBe('2026-07-31');
    } finally {
      await settings.restore();
    }
  });
});

describe('rota dışı — kargo', () => {
  it('bölgeye düşmeyen adres kargodur, gün seçimi yoktur', async () => {
    const outcome = await resolveDelivery({ postalCode: '75001', now: pazartesiSabah });
    expect(outcome).toMatchObject({ deliveryType: 'shipping', zoneId: null, availableDates: [], shippingBlockedReason: null });
  });

  it('sepette kargolanamayan ürün varsa kargo KAPANIR (soğuk zincir)', async () => {
    const outcome = await resolveDelivery({ postalCode: '75001', now: pazartesiSabah, hasNonShippableItem: true });
    expect(outcome.shippingBlockedReason).toBe('cold_chain');
  });

  it('rota içindeyse kargolanamayan ürün sorun DEĞİL — kapı teslimi zaten mümkün', async () => {
    const outcome = await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah, hasNonShippableItem: true });
    expect(outcome.deliveryType).toBe('route');
    expect(outcome.shippingBlockedReason).toBeNull();
  });

  it('kapatılan bölge rota sayılmaz — adres kargoya düşer', async () => {
    await zones.update({ id: createdZones[0]!, isActive: false });
    try {
      expect((await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah })).deliveryType).toBe('shipping');
    } finally {
      await zones.update({ id: createdZones[0]!, isActive: true });
    }
  });
});
