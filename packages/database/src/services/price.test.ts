import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { PriceService } from './price.service';
import { ProductService } from './product.service';

/**
 * Fiyat okuma (05.4) — DB üstünde. Burada YALNIZ satır getirme doğrulanır: `database` paketi
 * `domain-core`'u bilmez (STACK §4), dolayısıyla "hangi fiyat kazanır" kararı bu testin konusu
 * değildir — o karar motorun birim testinde (`domain-core/pricing`), ikisinin birleşimi ise
 * uygulama katmanında (vitrin okuma, 05.9) doğrulanır.
 *
 * Not: `customer` tablosu henüz yok (modül 04) — müşteriye özel fiyat satırı rastgele bir uuid ile
 * yazılır (FK yok, migration'da gerekçesi var).
 */
const db = serviceDb();
const prices = new PriceService(db);
const products = new ProductService(db);
const categories = new CategoryService(db);
let variantId: string;
let productId: string;
let categoryId: string;
const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';

beforeAll(async () => {
  const category = await categories.create({ name: { tr: `Fiyat testi ${Date.now()}` } });
  // create → { product, variants }: varyantsız üründe varsayılan varyant otomatik açılır (05.3).
  const { product, variants } = await products.create({ name: { tr: `Baklava ${Date.now()}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
});

// Test kendi zeminini toplar: aksi hâlde her koşuş yerel veritabanına kalıcı bir ürün bırakır ve
// operasyon listesinde çöp satır olarak görünür. Varyant ve fiyat satırları ürüne CASCADE bağlı.
afterAll(async () => {
  await products.delete(productId).catch(() => {});
  await categories.delete(categoryId).catch(() => {});
});

describe('PriceService — satır getirme', () => {
  it('kanal fiyatı yoksa null döner (ürün o kanalda satışa kapalı)', async () => {
    expect(await prices.findChannelPrice(variantId, 'b2c')).toBeNull();
  });

  it('yazılan kanal fiyatı okunur; müşteriye özel satır kanal fiyatını kirletmez', async () => {
    await prices.setPrice({ variantId, channel: 'b2c', amount: 16.9 });
    await prices.setPrice({ variantId, channel: 'b2c', amount: 14.0, customerId: CUSTOMER_ID });

    const channelPrice = await prices.findChannelPrice(variantId, 'b2c');
    expect(channelPrice?.amount).toBe(16.9);
    expect(channelPrice?.customerId).toBeNull();

    const customerPrice = await prices.findCustomerPrice(variantId, 'b2c', CUSTOMER_ID);
    expect(customerPrice?.amount).toBe(14);
  });

  it('en YENİ geçerli satır kazanır; gelecek tarihli satır henüz uygulanmaz', async () => {
    const gelecek = new Date(Date.now() + 86_400_000).toISOString();
    await prices.setPrice({ variantId, channel: 'b2c', amount: 19.9, validFrom: gelecek });

    expect((await prices.findChannelPrice(variantId, 'b2c'))?.amount).toBe(16.9); // bugün
    expect((await prices.findChannelPrice(variantId, 'b2c', new Date(Date.now() + 90_000_000)))?.amount).toBe(19.9);
  });

  it('findApplicable kanal + müşteri satırını tek turda getirir', async () => {
    const { channelPrice, customerPrice } = await prices.findApplicable(variantId, 'b2c', CUSTOMER_ID);
    expect(channelPrice?.amount).toBe(16.9);
    expect(customerPrice?.amount).toBe(14);
  });
});
