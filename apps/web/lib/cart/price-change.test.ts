import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { cartKey } from './cart-types';
import { getCartView } from './read';

/**
 * Sepetin fiyat ekseni (DOMAIN §5): fiyat arttıysa bildirilir, düştüyse sessiz uygulanır; çıpalı teklif partisi tükenince normal
 * fiyata dönüş de aynı mekanizmayla artış olarak bildirilir. `previousPrices` girişli müşterinin saklanmış fiyatlarıdır, sınanan yol
 * girişli yoldur.
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
let variantId: string;
let warehouseId: string;
let offerStockId: string;

const TAM_FIYAT = 3_000;
/** Teklif fiyatı — DLC'si yaklaşan partiye çıpalı. */
const TEKLIF_FIYATI = 2_000;

beforeAll(async () => {
  categoryId = (await new CategoryService(db).create({ name: { tr: `Fiyat ekseni ${stamp}` } })).id;
  const created = await new ProductService(db).create({
    name: { tr: `Fiyat ürünü ${stamp}` },
    categoryId,
    shippable: true,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  variantId = created.variants[0]!.id;
  await new PriceService(db).insert({ variantId, channel: 'b2c', amountCents: TAM_FIYAT });

  warehouseId = (await createTestWarehouse(db)).id;
  const stock = await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 3,
    expiryDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
  });
  offerStockId = stock.id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

/** Sepet niyeti — `stockId` verilirse satır o partiye ÇIPALI (teklif fiyatının şartı). */
const entry = (qty: number, stockId: string | null = null) => [{ kind: 'variant' as const, variantId, qty, stockId }];

/**
 * Saklanan fiyat haritasının anahtarı `cartKey` ile aynı biçimde kurulur (`variantId:stockId`); test kendi biçimini uydursaydı harita
 * hiç eşleşmez ve beklentiler sınamadan yeşil kalırdı.
 */
const priced = (cents: number, stockId: string | null = null) => new Map([[cartKey({ kind: 'variant', variantId, stockId }), cents]]);

describe('fiyat değişimi — artış bildirilir, düşüş sessiz (T3)', () => {
  it('fiyat ARTTIYSA satır eski fiyatı taşır — müşteri sessizce fazla ödemez', async () => {
    const view = await getCartView('tr', entry(1), {
      warehouseId,
      // Müşteri bu kalemi 25 €'ya görmüştü; bugünkü fiyat 30 €.
      previousPrices: priced(2_500),
    });

    expect(view.lines[0]?.unitPriceCents).toBe(TAM_FIYAT);
    expect(view.lines[0]?.priceChange).toEqual({ previousCents: 2_500 });
  });

  it('fiyat DÜŞTÜYSE bildirim YOK — indirim sürpriz değil, müşteriyi durdurmaz', async () => {
    const view = await getCartView('tr', entry(1), {
      warehouseId,
      // Müşteri 35 €'ya görmüştü; bugün 30 €.
      previousPrices: priced(3_500),
    });

    expect(view.lines[0]?.unitPriceCents).toBe(TAM_FIYAT);
    expect(view.lines[0]?.priceChange).toBeUndefined();
  });

  it('fiyat AYNIYSA bildirim yok — "değişmedi" bir haber değildir', async () => {
    const view = await getCartView('tr', entry(1), {
      warehouseId,
      previousPrices: priced(TAM_FIYAT),
    });

    expect(view.lines[0]?.priceChange).toBeUndefined();
  });
});

describe('teklif partisi tükenince (T2)', () => {
  it('ÇIPA TUTMUYORSA normal fiyata dönülür ve bu ARTIŞ olarak bildirilir — sessiz zam yok', async () => {
    /**
     * Satır bugünkü teklifin partisi olmayan bir partiye çıpalı; normal fiyata döner ama sessizce değil, gördüğü teklif fiyatı
     * `previousPrices`te durduğu için fark artış olarak bildirilir.
     */
    const view = await getCartView('tr', entry(1, offerStockId), {
      warehouseId,
      previousPrices: priced(TEKLIF_FIYATI, offerStockId),
    });

    expect(view.lines[0]?.unitPriceCents).toBe(TAM_FIYAT);
    expect(view.lines[0]?.priceChange).toEqual({ previousCents: TEKLIF_FIYATI });
    // Teklif düştüğü için üstü çizili "eski fiyat" da GÖSTERİLMEZ: teklif yoksa kıyas da yoktur.
    expect(view.lines[0]?.wasCents).toBeUndefined();
  });

  it('çıpa tutmayan satırda teklif TAVANI da düşer — olmayan teklifin sınırı uygulanmaz', async () => {
    const view = await getCartView('tr', entry(2, offerStockId), { warehouseId });

    // `limitCap` yalnız teklif GEÇERLİYKEN dolar; burada teklif yok, tavan da yok.
    expect(view.lines[0]?.limitCap).toBeNull();
  });
});
