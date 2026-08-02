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
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
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
  await new PriceService(db).insert({ variantId, channel: 'b2c', amount: 30 });

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
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds });
});

const entry = (qty: number) => [{ kind: 'variant' as const, variantId, qty, stockId: null }];

describe('sepetin yol ayrımı', () => {
  it('yerelde olmayan kargolanabilir kalem KARGO grubuna düşer — "tükendi" denmez', async () => {
    const view = await getCartView('tr', entry(1), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(view.lines[0]?.route).toBe('shipping');
    // Kritik: satır ENGELLİ değil. Bu ayrım olmadan müşteri kargoyla gönderebileceğimiz ürünü
    // "çıkarın" uyarısıyla görüyordu.
    expect(view.lines[0]?.blocked).toBe(false);
  });

  it('ücretsiz kargo eşiği KARGO grubunun tutarından ölçülür', async () => {
    const view = await getCartView('tr', entry(1), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(view.shippingSubtotalCents).toBe(3_000);
    // Eşik ayardan gelir; kalan = eşik − kargo grubu (sepetin tamamı değil).
    expect(shippingGroupFee(view).remainingForFreeCents).toBe(Math.max(0, view.freeShippingCents - 3_000));
  });

  it('kargo grubu yokken ücret de yok — boş grup eşiğin altı sayılmaz', async () => {
    const view = await getCartView('tr', entry(1), {});
    expect(shippingGroupFee(view).feeCents).toBe(0);
  });

  it('sepetin tamamı kargodaysa `shippingOnly` — müşteriye "iki sipariş" denmez', async () => {
    const view = await getCartView('tr', entry(2), { warehouseId: localWarehouseId, shippingWarehouseId });
    expect(view.shippingOnly).toBe(true);
  });

  it('YER BİLİNMİYORSA yol atanmaz — bilmediğimiz şey söylenmez', async () => {
    const view = await getCartView('tr', entry(1), {});
    expect(view.lines[0]?.route).toBeNull();
    expect(view.shippingOnly).toBe(false);
    expect(view.shippingSubtotalCents).toBe(0);
  });

  it('kargo deposu bilinmiyorsa kalem kargoya düşmez — uydurma yol yok', async () => {
    const view = await getCartView('tr', entry(1), { warehouseId: localWarehouseId });
    expect(view.lines[0]?.route).toBe('unavailable');
  });
});
