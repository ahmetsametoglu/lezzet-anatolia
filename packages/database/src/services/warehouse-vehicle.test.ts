import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { DeliveryZoneService } from './delivery-zone.service';
import { ProductService } from './product.service';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import { CategoryService } from './category.service';
import { createTestWarehouse, purgeTestData, purgeVariantStock } from '../testing';

/**
 * Araç deposunun üç kuralı veride (DOMAIN §17): araç kargo yapmaz, bölgeye bağlanmaz ve depo-üstü toplama girmez. Üçü de sessizce
 * bozulabilir: görünümden bir `join` düşse katalog araçtaki malı vaat eder, bir tetikleyici kaybolsa sipariş hareket hâlindeki bir yere
 * yazılır.
 */
const db = serviceDb();
const stamp = Date.now();

let tesisId: string;
let aracId: string;
let categoryId: string;
let productId: string;
let variantId: string;

beforeAll(async () => {
  tesisId = (await createTestWarehouse(db, { label: 'TESIS' })).id;
  aracId = (await createTestWarehouse(db, { label: 'ARAC', kind: 'vehicle' })).id;

  categoryId = (await new CategoryService(db).create({ name: { tr: `Araç testi ${stamp}` } })).id;
  const urun = await new ProductService(db).create({
    name: { tr: `Baklava ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' }, sku: `VEH-${stamp}` }],
  });
  productId = urun.product.id;
  variantId = urun.variants[0]!.id;
});

afterAll(async () => {
  // Parti sırasıyla gider: önce hareket defteri, sonra parti.
  await purgeVariantStock(db, [variantId]);
  // Tesisin bölgesini de `purgeTestData` siler (depoya bağlı bölgeler).
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [tesisId, aracId],
  });
});

describe('araç deposu — türün üç kuralı VERİDE', () => {
  it('araç kurulabiliyor ve türünü taşıyor', async () => {
    const arac = await new WarehouseService(db).getById(aracId);
    expect(arac!.kind).toBe('vehicle');
    // Varsayılan tesistir, araç istisnadır.
    expect((await new WarehouseService(db).getById(tesisId))!.kind).toBe('facility');
  });

  /** Kargo çıkışı bir adrestir, taşıyıcı oraya gelir; kural gönderim ülkesi satırının tetikleyicisinde (`warehouse_ship_country_guard`). */
  it('araç gönderim ülkesi alamaz; tesis alır', async () => {
    const depolar = new WarehouseService(db);
    await expect(depolar.setShipCountries(aracId, [{ country: 'DE', handover: null }])).rejects.toThrow(
      /araç ve QUALITE deposu gönderim ülkesi alamaz/,
    );

    // Pasif tesis: kural türe bakar, ülke başına tek aktif kargo deposu kuralına takılmadan sınanır.
    const kapaliTesis = await createTestWarehouse(db, { label: 'KTESIS', isActive: false });
    try {
      await depolar.setShipCountries(kapaliTesis.id, [{ country: 'DE', handover: null }]);
      expect((await depolar.list({ warehouseIds: [kapaliTesis.id] }))[0]?.shipsTo).toEqual(['DE']);
    } finally {
      await purgeTestData(db, { warehouseIds: [kapaliTesis.id] });
    }
  });

  /** Zincirin sonu bir adres olmalı; araca çözülseydi sipariş hareket hâlindeki bir yere yazılır ve hiçbir ekran fark etmezdi. */
  it('bölge ARACA bağlanamaz, tesise bağlanır', async () => {
    const { error } = await db
      .from('delivery_zone')
      .insert({ name: `Araç bölgesi ${stamp}`, warehouse_id: aracId, weekdays: [1] });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('tesis olmalı');

    const bolge = await new DeliveryZoneService(db).insert({
      name: `Tesis bölgesi ${stamp}`,
      warehouseId: tesisId,
      weekdays: [1],
    });
    expect(bolge.warehouseId).toBe(tesisId);
  });

  /**
   * Araçtaki mal siteden alınamaz ve akşam tesise döner, bu yüzden depo-üstü toplama girmez. Depo bazlı okuma aracı aynen gösterir,
   * çünkü kurye arabasında ne olduğunu görmek zorunda.
   */
  it('araç stoğu depo-ÜSTÜ toplama girmez ama depo bazlı okumada GÖRÜNÜR', async () => {
    const stocks = new StockService(db);
    // Toplam işe göredir: öteki işin her aktif tesisi aynı varyanta ayrı satır açar, okuma test depolarının işiyle süzülür.
    const { business } = (await new WarehouseService(db).getById(tesisId))!;
    const toplam = async () => (await stocks.getNetworkAvailabilityMap([variantId], business)).get(variantId)?.physicalQty;
    const depoda = async (warehouseId: string) => {
      const { data, error } = await db
        .from('available_stock')
        .select('physical_qty')
        .eq('variant_id', variantId)
        .eq('warehouse_id', warehouseId)
        .single();
      if (error) throw error;
      return Number(data.physical_qty);
    };

    const gun = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

    // Önce tesise 10: her zaman 0 dönen bir görünüm "araç sayılmıyor" testini sahte yeşil yapardı.
    await stocks.insert({ warehouseId: tesisId, variantId, physicalQty: 10, expiryDate: gun, purchasePriceCents: 500 });
    expect(await toplam()).toBe(10);

    // Sonra ARACA 40: toplam DEĞİŞMEZ, araç okuması 40 gösterir.
    await stocks.insert({ warehouseId: aracId, variantId, physicalQty: 40, expiryDate: gun, purchasePriceCents: 500 });
    expect(await toplam()).toBe(10);
    expect(await depoda(aracId)).toBe(40);
    expect(await depoda(tesisId)).toBe(10);
  });
});
