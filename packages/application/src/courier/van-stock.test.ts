import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, purgeVariantStock } from '@lezzet/database/testing';
import { listVanCandidates, readVanStock, returnFromVan, takeToVan, vehicleWarehouseOf } from './van-stock';

/**
 * **ARACA SERBEST ÜRÜN** (v3:19 · kullanıcı kararı 31.08).
 *
 * Sınanan üç şey, üçü de bu kapının KENDİ kararları:
 *   1. **Mal gerçekten taşınıyor** — depodan düşüyor, araca yazılıyor. Sipariş kutusundan farkı
 *      tam burada: kutu bir emanet değişimidir (stok oynamaz), serbest ürün stok hareketidir.
 *   2. **Ölçü FİİLİ değil KULLANILABİLİR** — müşteriye söz verilmiş mal araca alınmaz. Fiiliye
 *      bakılsaydı rezerve mal gider, sipariş depoda karşılıksız kalırdı.
 *   3. **Devir aynı kapının aynası** — geri koyma ayrı bir yol değil, kaynak ile hedefin yer
 *      değiştirmesi. Ayrı yazılsaydı biri bir gün ötekinden ayrılırdı.
 */
const db = serviceDb();
const stocks = new StockService(db);

const stamp = Date.now();
let variantId: string;
let productId: string;
let categoryId: string;
let facilityId: string;
let vanId: string;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const [facility, van] = await Promise.all([
    createTestWarehouse(db, { label: 'VS' }),
    /* ARAÇ BİR DEPODUR (`kind='vehicle'`) — kapının aradığı da tam bu tür. Tesis olarak
       kurulsaydı `vehicleWarehouseOf` onu bulmaz ve testin zemini sessizce yanlış olurdu. */
    createTestWarehouse(db, { label: 'VAN', kind: 'vehicle' }),
  ]);
  facilityId = facility.id;
  vanId = van.id;

  const category = await new CategoryService(db).create({ name: { tr: `Serbest ürün ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Şöbiyet ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

beforeEach(async () => {
  await purgeVariantStock(db, [variantId]);
  await mustDelete(db, 'warehouse_transfer', (q) => q.eq('from_warehouse_id', facilityId));
  await mustDelete(db, 'warehouse_transfer', (q) => q.eq('from_warehouse_id', vanId));
  await stocks.insert({
    warehouseId: facilityId,
    variantId,
    physicalQty: 10,
    expiryDate: dayOffset(30),
    purchasePriceCents: 200,
  });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [facilityId, vanId] });
});

describe('araç deposunun çözümü', () => {
  it('kapsamdaki `vehicle` depo bulunur; tesisler arasından o AYIKLANIR', async () => {
    expect(await vehicleWarehouseOf(db, [facilityId, vanId])).toBe(vanId);
    // Araç yoksa `null` — ekran boş liste değil SEBEP gösterir (serbest ürün gidecek yer ister).
    expect(await vehicleWarehouseOf(db, [facilityId])).toBeNull();
  });
});

describe('araca al / depoya devret', () => {
  it('MAL GERÇEKTEN TAŞINIR: depodan düşer, araca yazılır', async () => {
    const sonuc = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 3 });

    expect(sonuc).toMatchObject({ status: 'ok', movedQty: 3, vanQty: 3 });
    /* İDDİANIN KALBİ: kapı "oldu" demiyor, iki deponun stoğu değişti. Sipariş kutusunda bu
       olmuyordu (emanet değişimi) — serbest üründe olmak ZORUNDA, çünkü kapıda o stoktan
       satılacak. */
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([
      expect.objectContaining({ variantId, qty: 3 }),
    ]);
    const depoda = await stocks.getAvailable(facilityId, variantId);
    expect(depoda.physicalQty).toBe(7);
  });

  it('OLMAYAN mal araca alınmaz ve ret HİÇBİR iz bırakmaz', async () => {
    /*
      ÖLÇÜ `available_stock` GÖRÜNÜMÜNDEN geliyor, partiden değil — yani rezerveler zaten düşülmüş
      hâlde. Burada sınanan o görünümün kendisi değil (onun sözleşmesi kendi testinde), KAPININ
      cevabı: yetmeyen mal reddediliyor, sayı dönüyor ve yarım bir taşıma yazılmıyor.

      Rezerve dalı ayrıca `dispatch_transfer`ın kendi duvarında da duruyor (0031: *"kontrol sevkten
      ÖNCE ve fiili üzerinden değil kullanılabilir üzerinden"*) — yani buradaki kapı tek savunma
      değil, sebebi SÖYLEYEN savunma.
    */
    const sonuc = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 15 });

    expect(sonuc).toEqual({ status: 'not_enough', available: 10 });
    // Ret hiçbir iz bırakmamalı: yarım yazılmış bir taşıma, malı iki depoda birden yok ederdi.
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([]);
  });

  it('DEVİR aynı kapının aynası: araçtan depoya geri döner', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 4 });

    const sonuc = await returnFromVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 3 });

    expect(sonuc).toMatchObject({ status: 'ok', movedQty: 3 });
    expect(await readVanStock(db, { vehicleWarehouseId: vanId })).toEqual([
      expect.objectContaining({ variantId, qty: 1 }),
    ]);
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(9);
  });

  it('ARAÇ YOKSA hiçbir şey yazılmaz — gidecek bir yer yok', async () => {
    const sonuc = await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: null, variantId, qty: 1 });

    expect(sonuc).toEqual({ status: 'no_vehicle' });
    expect((await stocks.getAvailable(facilityId, variantId)).physicalQty).toBe(10);
  });
});

describe('alınabilecekler listesi', () => {
  it('KULLANILABİLİR adediyle döner ve ad taşır — kurye kimliği okumaz', async () => {
    const liste = await listVanCandidates(db, { warehouseId: facilityId });

    const satir = liste.find((row) => row.variantId === variantId);
    expect(satir).toMatchObject({ available: 10 });
    /* Ad ZORUNLU: uuid'den ne alacağını çıkaramayan bir kurye için liste işe yaramaz (künyenin
       "kimlik kimseye bir şey söylemez" kuralı). */
    expect(satir?.name).toContain('Şöbiyet');
  });

  it('araca alınan mal DEPODAKİ sayıdan düşer — iki liste aynı gerçeği anlatır', async () => {
    await takeToVan(db, { warehouseId: facilityId, vehicleWarehouseId: vanId, variantId, qty: 4 });

    const liste = await listVanCandidates(db, { warehouseId: facilityId });

    expect(liste.find((row) => row.variantId === variantId)).toMatchObject({ available: 6 });
  });
});
