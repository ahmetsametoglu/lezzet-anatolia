import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehousePair, purgeTestData } from '@lezzet/database/testing';
import { getCartView } from './read';
import { shippingGroupFee } from './cart-types';

/**
 * Sepetin YOL ayrımı (19.11) — `decideCartAgainstWarehouse` motorunun kablosu.
 *
 * Motorun kendi kararı birim testlerinde sınanıyor (`domain-core/delivery/cart-warehouse.test.ts`);
 * burada sınanan şey okumanın onu **doğru beslediği**: yerel depo ile kargo deposu ayrı haritalardan
 * geliyor mu, ve ücretsiz kargo eşiği KARGO GRUBUNUN tutarından mı hesaplanıyor.
 *
 * Eşik ayrımı K37'nin kuralı ve bir para sorusu: bölünmeseydi 80 €'luk bir rota siparişi 5 €'luk
 * kargo kalemini bedava taşıtırdı — kendi aracımızla giden malın tutarı, bir kargo firmasına
 * ödediğimiz ücreti karşılamaz.
 *
 * Terfiyle birlikte web'den geldi (aşama 1/3); tek fark kapının artık `db`yi çağırandan alması.
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
/** Soğuk zincir ürünü testin İÇİNDE doğuyor; teardown'a yakalanması için dışarıda tutuluyor. */
let coldProductId: string | null = null;
let variantId: string;
let localWarehouseId: string;
let shippingWarehouseId: string;
const warehouseIds: string[] = [];

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Yol testi ${stamp}` } });
  categoryId = category.id;

  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Yol ürünü ${stamp}` },
    categoryId,
    // Kargolanabilir: soğuk zincir olsaydı motor kargo yolunu hiç açmazdı.
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: 3000 });

  const pair = await createTestWarehousePair(db);
  localWarehouseId = pair.primary.id;
  shippingWarehouseId = pair.secondary.id;
  warehouseIds.push(localWarehouseId, shippingWarehouseId);

  // Stok YALNIZ kargo deposunda: müşterinin kendi deposu boş.
  await new StockService(db).insert({
    warehouseId: shippingWarehouseId,
    variantId,
    physicalQty: 10,
    expiryDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  });
});

afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId, ...(coldProductId ? [coldProductId] : [])],
    categoryIds: [categoryId],
    warehouseIds,
  });
});

const entry = (qty: number) => [{ kind: 'variant' as const, variantId, qty, stockId: null }];

describe('sepetin yol ayrımı', () => {
  it('yerelde olmayan kargolanabilir kalem KARGO grubuna düşer — "tükendi" denmez', async () => {
    const view = await getCartView(db, 'tr',entry(1), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(view.lines[0]?.route).toBe('shipping');
    // Kritik: satır ENGELLİ değil. Bu ayrım olmadan müşteri kargoyla gönderebileceğimiz ürünü
    // "çıkarın" uyarısıyla görüyordu.
    expect(view.lines[0]?.blocked).toBe(false);
  });

  it('ücretsiz kargo eşiği KARGO grubunun tutarından ölçülür', async () => {
    const view = await getCartView(db, 'tr',entry(1), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(view.shippingSubtotalCents).toBe(3_000);
    // Eşik ayardan gelir; kalan = eşik − kargo grubu (sepetin tamamı değil).
    expect(shippingGroupFee(view).remainingForFreeCents).toBe(Math.max(0, view.freeShippingCents - 3_000));
  });

  it('kargo grubu yokken ücret de yok — boş grup eşiğin altı sayılmaz', async () => {
    const view = await getCartView(db, 'tr',entry(1), {});
    expect(shippingGroupFee(view).feeCents).toBe(0);
  });

  it('sepetin tamamı kargodaysa `shippingOnly` — müşteriye "iki sipariş" denmez', async () => {
    const view = await getCartView(db, 'tr',entry(2), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(view.shippingOnly).toBe(true);
  });

  it('YER BİLİNMİYORSA yol atanmaz — bilmediğimiz şey söylenmez', async () => {
    const view = await getCartView(db, 'tr',entry(1), {});
    expect(view.lines[0]?.route).toBeNull();
    expect(view.shippingOnly).toBe(false);
    expect(view.shippingSubtotalCents).toBe(0);
    // Yol bilinmiyorsa "kaç tane var" da bilinmiyor: adet tavanı uydurulmaz.
    expect(view.lines[0]?.availableHere).toBeNull();
  });

  it('SATIRIN kendi havuzundaki miktar taşınır — istenen adet kadar değil', async () => {
    // Motorun `fulfillableQty` alanı `min(istenen, mevcut)` döndürüyor; ekran ondan "tavana
    // dayandım mı" sorusunu cevaplayamaz. 1 adet isteyip 10 bulunan satırda da havuz 10'dur.
    const one = await getCartView(db, 'tr',entry(1), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(one.lines[0]?.availableHere).toBe(10);

    // İstenen adet havuzu aşsa da taşınan sayı havuzun kendisidir — sepetin düzeltme düğmesi
    // ve checkout'un reddi aynı sayıyı söylemek zorunda.
    const many = await getCartView(db, 'tr',entry(25), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(many.lines[0]?.availableHere).toBe(10);
    expect(many.lines[0]?.route).toBe('shipping');
  });

  it('kargo deposu bilinmiyorsa kalem kargoya düşmez — uydurma yol yok', async () => {
    const view = await getCartView(db, 'tr',entry(1), { warehouseId: localWarehouseId });
    expect(view.lines[0]?.route).toBe('unavailable');
  });

  /**
   * ── ROTA DIŞI ADRES: "rota deposu yok" ≠ "yer bilinmiyor" (10.08) ──────────
   *
   * Arıza mobil şeridin cihaz ölçümüyle çıktı ve iki yüzeyi birden kapsıyordu: `decideRoutes` yalnız
   * rota deposunu alıyor, o boşsa BOŞ harita dönüyordu. Satırlar kuruluş değerinde kalıyor
   * (`route: null` → `group: 'local'`), yani rota dışındaki her adreste sepet her kalemi "kapıya
   * teslim ediyoruz" diye gösteriyordu — soğuk zincir kalemi de dahil, o adrese hiç gelemezken.
   *
   * Test yerin İKİ hâlini ayırıyor, çünkü arızanın kökü tam olarak ikisinin tek sayılmasıydı.
   */
  it('ROTA DIŞI adreste kargolanabilir kalem KARGO yolunu alır — rota deposu yok diye yol düşmez', async () => {
    const view = await getCartView(db, 'tr', entry(1), { shippingWarehouseId });
    expect(view.lines[0]?.route).toBe('shipping');
    // Grup da tazelenmeli: bir tur `local` kalıyordu ve müşteriye kapıya teslim sözü veriyordu.
    expect(view.lines[0]?.group).toBe('shipping');
    // Sepetin tamamı kargo grubunda: rota grubu hiç yok.
    expect(view.shippingOnly).toBe(true);
  });

  it('ROTA DIŞI adreste SOĞUK ZİNCİR kalem teslim edilemez sayılır — asgari sepete de girmez', async () => {
    // Ayrı ürün: `shippable: false`, yani kargo yolu bu ürün için hiç açılmaz.
    const cold = await new ProductService(db).create({
      name: { tr: `Soğuk zincir ${stamp}` },
      categoryId,
      shippable: false,
      variants: [{ label: { tr: '500 g' } }],
    });
    const coldVariantId = cold.variants[0]!.id;
    await new PriceService(db).insert({ variantId: coldVariantId, channel: 'b2c', amountCents: 1_800 });
    // Stok KARGO deposunda duruyor — ama ürün kargolanamaz, yani oraya erişilemez.
    await new StockService(db).insert({
      warehouseId: shippingWarehouseId,
      variantId: coldVariantId,
      physicalQty: 5,
      expiryDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    });
    coldProductId = cold.product.id;

    const view = await getCartView(db, 'tr', [{ kind: 'variant', variantId: coldVariantId, qty: 1, stockId: null }], {
      shippingWarehouseId,
    });
    expect(view.lines[0]?.route).toBe('not_shippable_here');
    expect(view.lines[0]?.group).toBe('undeliverable');
    // Gelemeyecek malın tutarı asgari sepet matrahına SAYILMAZ; bir tur daima 0 kalıyordu.
    expect(view.undeliverableSubtotalCents).toBe(1_800);
  });
});
