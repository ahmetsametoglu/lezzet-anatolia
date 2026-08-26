import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { DeliveryZoneService } from './delivery-zone.service';
import { ProductService } from './product.service';
import { StockService } from './stock.service';
import { WarehouseService } from './warehouse.service';
import { CategoryService } from './category.service';
import { createTestWarehouse, purgeTestData } from '../testing';

/**
 * **Araç deposunun üç kuralı** (26.08, kullanıcı kararı · `DOMAIN §17`).
 *
 * Kurye satılan maldan fazlasını yükleyip yolda satabiliyor, o yüzden araç bir DEPO TÜRÜ. Türün
 * kendisi bir etiket değil, üç sorgunun süzgeci — ve üçü de VERİDE zorlanıyor. Bu dosya o üç
 * kuralın gerçekten koştuğunu tutuyor.
 *
 * **Neden test şart:** üçü de sessizce bozulabilecek sınıftan. Görünümden bir `join` düşse, bir
 * tetikleyici migration düzenlenirken kaybolsa hiçbir şey patlamaz — yalnız katalog bir gün
 * araçtaki malı "bizde var" diye vaat eder ya da bir müşteri siparişi hareket hâlindeki bir yere
 * yazılır. Kurallar 26.08'de elle ölçülmüştü; ölçüm bir kerelikti, bu dosya kalıcı.
 */
const db = serviceDb();
const stamp = Date.now();

let tesisId: string;
let aracId: string;
let categoryId: string;
let productId: string;
let variantId: string;
const zoneIds: string[] = [];

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
  await db.from('stock').delete().eq('variant_id', variantId);
  if (zoneIds.length > 0) await db.from('delivery_zone').delete().in('id', zoneIds);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    warehouseIds: [tesisId, aracId],
  });
});

describe('araç deposu — türün üç kuralı VERİDE (26.08)', () => {
  it('araç kurulabiliyor ve türünü taşıyor', async () => {
    const arac = await new WarehouseService(db).getById(aracId);
    expect(arac!.kind).toBe('vehicle');
    // Varsayılan tesis: bugüne kadarki her satır tesistir, araç istisnadır.
    expect((await new WarehouseService(db).getById(tesisId))!.kind).toBe('facility');
  });

  /**
   * Kargo çıkış deposu bir ADRESTİR — taşıyıcı oraya gelir. Kısıt aynı tabloda durabildiği için
   * tetikleyiciye gerek yok (`warehouse_vehicle_never_ships`).
   */
  it('araç KARGO DEPOSU olamaz', async () => {
    const { error } = await db.from('warehouse').update({ ships_online: true }).eq('id', aracId);
    expect(error?.code).toBe('23514');

    // Aynı işlem tesiste engellenmiyor — kısıt türe bakıyor, herkese kapı kapatmıyor.
    // (Ülke başına tek kargo deposu kuralı ayrı ve o `warehouse_single_online`ın işi; burada
    // yalnız türün reddedilmediğini görüyoruz, o yüzden hemen geri alınıyor.)
    const acildi = await db.from('warehouse').update({ ships_online: true }).eq('id', tesisId);
    if (acildi.error === null) await db.from('warehouse').update({ ships_online: false }).eq('id', tesisId);
    expect(acildi.error?.code).not.toBe('23514');
  });

  /**
   * "Posta kodu → bölge → depo" zincirinin sonu bir adres olmak zorunda: rota oradan çıkar, mal
   * kabul oraya yapılır. Zincir bir araca çözülseydi müşteri siparişi hareket hâlindeki bir yere
   * yazılırdı ve hiçbir ekran fark etmezdi — sipariş geçerli görünür, deposu geçerli görünür.
   */
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
    zoneIds.push(bolge.id);
    expect(bolge.warehouseId).toBe(tesisId);
  });

  /**
   * Katalog için "bizde var" bir SÖZDÜR ve araçtaki mal siteden alınamaz — yolda, başkasının
   * rotasında. Tedarik önerisi için de o mal zaten tesisten çıkmıştır ve akşam döner; sayılsaydı
   * ikinci kez sayılırdı.
   *
   * Depo BAZLI okuma aracı AYNEN gösterir: kuryenin ekranı arabasında ne olduğunu görmek zorunda.
   * Ayrımın toplamda olması, kaynakta olmaması tam bu yüzden.
   */
  it('araç stoğu depo-ÜSTÜ toplama girmez ama depo bazlı okumada GÖRÜNÜR', async () => {
    const toplam = async () => {
      const { data } = await db.from('available_stock_total').select('physical_qty').eq('variant_id', variantId).maybeSingle();
      return Number(data?.physical_qty ?? 0);
    };
    const depoda = async (warehouseId: string) => {
      const { data } = await db
        .from('available_stock')
        .select('physical_qty')
        .eq('variant_id', variantId)
        .eq('warehouse_id', warehouseId)
        .maybeSingle();
      return Number(data?.physical_qty ?? 0);
    };

    const stocks = new StockService(db);
    const gun = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);

    // Önce TESİSE 10: toplam onu sayar — görünümün sağlıklı olduğunun kanıtı da bu
    // (her zaman 0 dönen bir görünüm "araç sayılmıyor" testini sahte yeşil yapardı).
    await stocks.insert({ warehouseId: tesisId, variantId, physicalQty: 10, expiryDate: gun, purchasePriceCents: 500 });
    expect(await toplam()).toBe(10);

    // Sonra ARACA 40: toplam DEĞİŞMEZ, araç okuması 40 gösterir.
    await stocks.insert({ warehouseId: aracId, variantId, physicalQty: 40, expiryDate: gun, purchasePriceCents: 500 });
    expect(await toplam()).toBe(10);
    expect(await depoda(aracId)).toBe(40);
    expect(await depoda(tesisId)).toBe(10);
  });
});
