import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { UserProfileService } from './user-profile.service';
import { PriceService } from './price.service';
import { ProductService } from './product.service';

/**
 * Fiyat okuma, DB üstünde: yalnız satır getirme doğrulanır, "hangi fiyat kazanır" kararı motorun birim testindedir (STACK §4).
 * Müşteriye özel fiyat gerçek bir profile bağlıdır, çünkü `price.customer_id` FK'lidir.
 */
const db = serviceDb();
const prices = new PriceService(db);
const products = new ProductService(db);
const categories = new CategoryService(db);
const profiles = new UserProfileService(db);
let variantId: string;
let productId: string;
let categoryId: string;
let CUSTOMER_ID: string;

beforeAll(async () => {
  const category = await categories.create({ name: { tr: `Fiyat testi ${Date.now()}` } });
  // Varyantsız üründe varsayılan varyant otomatik açılır.
  const { product, variants } = await products.create({ name: { tr: `Baklava ${Date.now()}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  CUSTOMER_ID = (await profiles.insert({ name: `Fiyat müşterisi ${Date.now()}` })).id;
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: [CUSTOMER_ID] });
});

describe('PriceService — satır getirme', () => {
  it('kanal fiyatı yoksa null döner (ürün o kanalda satışa kapalı)', async () => {
    expect(await prices.findChannelPrice(variantId, 'b2c')).toBeNull();
  });

  it('yazılan kanal fiyatı okunur; müşteriye özel satır kanal fiyatını kirletmez', async () => {
    await prices.setPrice({ variantId, channel: 'b2c', amountCents: 1690 });
    await prices.setPrice({ variantId, channel: 'b2c', amountCents: 1400, customerId: CUSTOMER_ID });

    const channelPrice = await prices.findChannelPrice(variantId, 'b2c');
    expect(channelPrice?.amountCents).toBe(1690);
    expect(channelPrice?.customerId).toBeNull();

    const customerPrice = await prices.findCustomerPrice(variantId, 'b2c', CUSTOMER_ID);
    expect(customerPrice?.amountCents).toBe(1400);
  });

  it('en YENİ geçerli satır kazanır; gelecek tarihli satır henüz uygulanmaz', async () => {
    const gelecek = new Date(Date.now() + 86_400_000).toISOString();
    await prices.setPrice({ variantId, channel: 'b2c', amountCents: 1990, validFrom: gelecek });

    expect((await prices.findChannelPrice(variantId, 'b2c'))?.amountCents).toBe(1690); // bugün
    expect((await prices.findChannelPrice(variantId, 'b2c', new Date(Date.now() + 90_000_000)))?.amountCents).toBe(1990);
  });

  it('findApplicable kanal + müşteri satırını tek turda getirir', async () => {
    const { channelPrice, customerPrice } = await prices.findApplicable(variantId, 'b2c', CUSTOMER_ID);
    expect(channelPrice?.amountCents).toBe(1690);
    expect(customerPrice?.amountCents).toBe(1400);
  });
});

/** Ülke satırı genel okumaya karışsaydı Fransa'daki müşteri Almanya fiyatını görürdü; müşteriye özel fiyat ülkeden bağımsızdır. */
describe('PriceService — ülke satırı', () => {
  it('daha yeni ülke satırı genel kanal okumasına karışmaz', async () => {
    await prices.setPrice({ variantId, channel: 'b2c', amountCents: 2290, country: 'DE' });

    expect(await prices.findChannelPrice(variantId, 'b2c')).toMatchObject({ amountCents: 1690, country: null });
    expect((await prices.findApplicableMap([variantId], 'b2c')).get(variantId)?.channelPrice?.amountCents).toBe(1690);
  });

  it('müşteriye özel fiyat ülke taşıyamaz', async () => {
    await expect(
      prices.setPrice({ variantId, channel: 'b2c', amountCents: 1500, customerId: CUSTOMER_ID, country: 'DE' }),
    ).rejects.toThrow(/price_customer_no_country/);
  });

  it('ülkeli okuma ülke satırını daha yeni genel satıra rağmen önceler; satırı olmayan ülke genel satırı okur', async () => {
    await prices.setPrice({ variantId, channel: 'b2c', amountCents: 1790 });

    const ulkeli = (country: 'DE' | 'FR') => prices.findApplicableMap([variantId], 'b2c', CUSTOMER_ID, new Date(), country);
    expect((await ulkeli('DE')).get(variantId)).toMatchObject({
      channelPrice: { amountCents: 2290, country: 'DE' },
      customerPrice: { amountCents: 1400 },
    });
    expect((await ulkeli('FR')).get(variantId)?.channelPrice).toMatchObject({ amountCents: 1790, country: null });
    expect((await prices.findApplicableMap([variantId], 'b2c')).get(variantId)?.channelPrice?.amountCents).toBe(1790);
  });

  it('operasyon okuması genel ve ülke satırını ayrı verir; fiyatı olmayan varyant boş döner', async () => {
    const fiyatsiz = crypto.randomUUID();
    const map = await prices.findListPricesMap([variantId, fiyatsiz], 'b2c');

    expect(map.get(variantId)).toMatchObject({ general: { amountCents: 1790 }, byCountry: { DE: { amountCents: 2290 } } });
    expect(map.get(fiyatsiz)).toEqual({ general: null, byCountry: {} });
  });

  it('ülke fiyatı geçmişiyle kaldırılır; genel satır ve öbür kanalın ülke satırı kalır', async () => {
    const dun = new Date(Date.now() - 86_400_000).toISOString();
    await prices.setPrice({ variantId, channel: 'b2c', amountCents: 2190, country: 'DE', validFrom: dun });
    await prices.setPrice({ variantId, channel: 'b2b', amountCents: 3000, country: 'DE' });

    await prices.removeCountryPrice(variantId, 'b2c', 'DE');

    expect((await prices.findListPricesMap([variantId], 'b2c')).get(variantId)).toMatchObject({
      general: { amountCents: 1790 },
      byCountry: {},
    });
    expect((await prices.findApplicableMap([variantId], 'b2c', null, new Date(), 'DE')).get(variantId)?.channelPrice).toMatchObject({
      amountCents: 1790,
      country: null,
    });
    expect((await prices.findListPricesMap([variantId], 'b2b')).get(variantId)?.byCountry.DE?.amountCents).toBe(3000);
  });
});

/**
 * Para servis sınırında çevriliyor mu (STACK §8): cent yazıp cent okuyan test aynı yanlış sabitle çarpılsa da geçerdi, bu yüzden ham
 * kolon okunur.
 */
describe('PriceService — euro↔cent sınırı', () => {
  it('cent yazılır, kolon euro tutar, cent okunur (gidiş-dönüş)', async () => {
    const yazilan = 1234; // 12,34 €
    const created = await prices.setPrice({ variantId, channel: 'b2b', amountCents: yazilan });
    expect(created.amountCents).toBe(yazilan);

    const { data } = await db.from('price').select('amount').eq('id', created.id).single();
    expect(Number((data as { amount: number | string }).amount)).toBe(12.34);

    const okunan = await prices.findChannelPrice(variantId, 'b2b');
    expect(okunan?.amountCents).toBe(yazilan);
  });
});
