import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { UserProfileService } from './user-profile.service';
import { PriceService } from './price.service';
import { ProductService } from './product.service';

/**
 * Fiyat okuma (05.4) — DB üstünde. Burada YALNIZ satır getirme doğrulanır: `database` paketi
 * `domain-core`'u bilmez (STACK §4), dolayısıyla "hangi fiyat kazanır" kararı bu testin konusu
 * değildir — o karar motorun birim testinde (`domain-core/pricing`), ikisinin birleşimi ise
 * uygulama katmanında (vitrin okuma, 05.9) doğrulanır.
 *
 * Not: müşteriye özel fiyat satırı GERÇEK bir profile bağlıdır — `price.customer_id` FK'li (0013)
 * ve tek kimlik tablosunu (`user_profiles`) işaret eder. Uydurma uuid yazılamaz.
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
  // create → { product, variants }: varyantsız üründe varsayılan varyant otomatik açılır (05.3).
  const { product, variants } = await products.create({ name: { tr: `Baklava ${Date.now()}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  CUSTOMER_ID = (await profiles.insert({ name: `Fiyat müşterisi ${Date.now()}` })).id;
});

// Test kendi zeminini toplar: aksi hâlde her koşuş yerel veritabanına kalıcı bir ürün bırakır ve
// operasyon listesinde çöp satır olarak görünür. Varyant ve fiyat satırları ürüne CASCADE bağlı.
afterAll(async () => {
  await products.delete(productId).catch(() => {});
  await categories.delete(categoryId).catch(() => {});
  await db.from('user_profiles').delete().eq('id', CUSTOMER_ID);
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

/**
 * SINIR TESTİ (02.9 · STACK §8) — para servis sınırında çevriliyor mu.
 *
 * Yukarıdaki testler cent'i yazıp cent'i okuyor; ikisi de aynı yanlış sabitle çarpılsa yine geçerdi.
 * Bu yüzden burada **ham kolon** okunur: uygulama cent yazar, DB euro `numeric` tutar, geri okunan
 * değer yine cent'tir. Zinciri kıran her değişiklik (beyanın düşmesi, kolonun adının kayması) burada
 * patlar — ekranda 0,74 € olarak değil.
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
