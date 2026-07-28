import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeliveryZoneService, SettingsService, serviceDb } from '@lezzet/database';
import { resolveDelivery } from './delivery';

/**
 * Checkout teslimat çözümü (07.2) — DB + ayar + motor birlikte. "Hangi gün, kesim saati nasıl
 * işliyor" motorun birim testinde (`domain-core/delivery`); burada **bölge ve ayarın gerçekten
 * okunduğu** doğrulanır.
 */
const db = serviceDb();
const zones = new DeliveryZoneService(db);

const stamp = Date.now();
const rotaKodu = `67${String(stamp).slice(-3)}`;
const createdZones: string[] = [];

beforeAll(async () => {
  const zone = await zones.insert({
    name: `Test bölgesi ${stamp}`,
    postalCodes: [rotaKodu],
    weekdays: [2, 5], // Salı, Cuma
  });
  createdZones.push(zone.id);
  SettingsService.invalidate();
});

afterAll(async () => {
  await db.from('delivery_zone').delete().in('id', createdZones);
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

  it('kesim saati AYARDAN okunur — değiştirince gün hesabı değişir', async () => {
    const settings = new SettingsService(db);
    const saliOgle = new Date(2026, 6, 28, 12, 0); // Salı 12:00, teslimat günü

    // Varsayılan kesim 16:00 → bugün hâlâ yetişir.
    expect((await resolveDelivery({ postalCode: rotaKodu, now: saliOgle })).availableDates[0]).toBe('2026-07-28');

    // Kesim öne çekilirse aynı sipariş bugüne yetişmez.
    await settings.set('order_cutoff_time', '10:00');
    try {
      expect((await resolveDelivery({ postalCode: rotaKodu, now: saliOgle })).availableDates[0]).toBe('2026-07-31');
    } finally {
      await settings.set('order_cutoff_time', '16:00');
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
