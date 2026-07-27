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

const damga = Date.now();
const rotaKodu = `67${String(damga).slice(-3)}`;
const acilanBolgeler: string[] = [];

beforeAll(async () => {
  const zone = await zones.insert({
    name: `Test bölgesi ${damga}`,
    postalCodes: [rotaKodu],
    weekdays: [2, 5], // Salı, Cuma
  });
  acilanBolgeler.push(zone.id);
  SettingsService.invalidate();
});

afterAll(async () => {
  await db.from('delivery_zone').delete().in('id', acilanBolgeler);
  SettingsService.invalidate();
});

const pazartesiSabah = new Date(2026, 6, 27, 9, 0);

describe('rota içi teslimat (07.2)', () => {
  it('posta kodu bölgeye düşüyorsa rota içi + yaklaşan günler gelir', async () => {
    const sonuc = await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah });

    expect(sonuc.deliveryType).toBe('route');
    expect(sonuc.zoneId).toBe(acilanBolgeler[0]);
    expect(sonuc.availableDates).toEqual(['2026-07-28', '2026-07-31', '2026-08-04']);
    expect(sonuc.requiresDateChoice).toBe(true);
  });

  it('tek tarih önerildiğinde seçim sunulmaz', async () => {
    const sonuc = await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah, dateCount: 1 });
    expect(sonuc.requiresDateChoice).toBe(false);
    expect(sonuc.availableDates).toHaveLength(1);
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
    const sonuc = await resolveDelivery({ postalCode: '75001', now: pazartesiSabah });
    expect(sonuc).toMatchObject({ deliveryType: 'shipping', zoneId: null, availableDates: [], shippingBlockedReason: null });
  });

  it('sepette kargolanamayan ürün varsa kargo KAPANIR (soğuk zincir)', async () => {
    const sonuc = await resolveDelivery({ postalCode: '75001', now: pazartesiSabah, hasNonShippableItem: true });
    expect(sonuc.shippingBlockedReason).toBe('cold_chain');
  });

  it('rota içindeyse kargolanamayan ürün sorun DEĞİL — kapı teslimi zaten mümkün', async () => {
    const sonuc = await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah, hasNonShippableItem: true });
    expect(sonuc.deliveryType).toBe('route');
    expect(sonuc.shippingBlockedReason).toBeNull();
  });

  it('kapatılan bölge rota sayılmaz — adres kargoya düşer', async () => {
    await zones.update({ id: acilanBolgeler[0]!, isActive: false });
    try {
      expect((await resolveDelivery({ postalCode: rotaKodu, now: pazartesiSabah })).deliveryType).toBe('shipping');
    } finally {
      await zones.update({ id: acilanBolgeler[0]!, isActive: true });
    }
  });
});
