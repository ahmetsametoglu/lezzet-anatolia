import { afterAll, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../client';
import { ProductListingService, ProductService } from './product.service';
import { PriceService } from './price.service';
import { CollectionService } from './collection.service';

// Entegrasyon testleri — local Supabase'e vurur (pnpm db:start + migrationlar uygulı olmalı).
const db = createServiceRoleClient();
const products = new ProductService(db);
const listings = new ProductListingService(db);
const prices = new PriceService(db);
const collections = new CollectionService(db);
const productIds: string[] = [];
const collectionIds: string[] = [];

afterAll(async () => {
  // Ürün silinince variant + product_collections FK cascade ile düşer; koleksiyonlar sonra.
  for (const id of productIds) await products.delete(id).catch(() => {});
  for (const id of collectionIds) await collections.delete(id).catch(() => {});
});

describe('ProductService', () => {
  it('varyant verilmezse varsayılan varyant otomatik açılır', async () => {
    const { product, variants } = await products.create({ name: { tr: 'Kıymalı Börek' } });
    productIds.push(product.id);
    expect(product.slug).toBe('kiymali-borek');
    expect(product.vatRate).toBe(5.5); // DB default, numeric → number okundu
    expect(variants).toHaveLength(1);
    const [defaultVariant] = variants;
    expect(defaultVariant?.productId).toBe(product.id);
    // Varsayılan varyantın etiketi BOŞ: tek boylu üründe gösterilecek bir boy adı yok.
    expect(defaultVariant?.label).toEqual({});
  });

  it('verilen varyantlarla açılır (sıralı)', async () => {
    const { product, variants } = await products.create({
      name: { tr: 'Maraş Dondurma' },
      variants: [
        { label: { tr: '70 gr', fr: '70 g' }, netWeightG: 70 },
        { label: { tr: '500 gr', fr: '500 g' }, netWeightG: 500 },
      ],
    });
    productIds.push(product.id);
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.label)).toEqual([
      { tr: '70 gr', fr: '70 g' },
      { tr: '500 gr', fr: '500 g' },
    ]);
    expect(variants.map((v) => v.sortOrder)).toEqual([0, 1]);
  });

  /* `listSellable` `ProductListingService`e taşındı (08.46): satılabilirlik kanal fiyatını da
     gerektiriyor ve o bilgi ürün tablosunda yok.

     **Aday ürüne FİYAT yazılıyor** ve bu şart: yazılmasaydı aday zaten fiyatsız olduğu için listeden
     düşer ve test, `status` süzgeci tamamen kalksa bile YEŞİL kalırdı — iddiasını değil, tesadüfü
     ölçerdi. Fiyatlı aday, "aday satılamaz" kuralını yalnız başına sınıyor. */
  it('aday ürün satılabilir listede YOK, aday listesinde VAR', async () => {
    const { product: candidate, variants } = await products.create({ name: { tr: 'Deneme Aday' }, status: 'candidate' });
    productIds.push(candidate.id);
    await prices.insert({ variantId: variants[0]!.id, channel: 'b2c', amountCents: 500, validFrom: new Date().toISOString() });
    const sellable = await listings.listSellable();
    const candidates = await products.listCandidates();
    expect(sellable.some((p) => p.id === candidate.id)).toBe(false);
    expect(candidates.some((p) => p.id === candidate.id)).toBe(true);
  });

  it('ürün iki koleksiyona girip çıkabiliyor', async () => {
    const { product } = await products.create({ name: { tr: 'Bağ Testi Ürünü' } });
    productIds.push(product.id);
    const c1 = await collections.create({ name: { tr: 'Koleksiyon A' } });
    const c2 = await collections.create({ name: { tr: 'Koleksiyon B' } });
    collectionIds.push(c1.id, c2.id);

    await collections.addProduct(c1.id, product.id);
    await collections.addProduct(c2.id, product.id);
    await collections.addProduct(c2.id, product.id); // idempotent
    expect(await collections.productIds(c1.id)).toEqual([product.id]);
    expect(await collections.productIds(c2.id)).toEqual([product.id]);

    await collections.removeProduct(c1.id, product.id);
    expect(await collections.productIds(c1.id)).toEqual([]);
    expect(await collections.productIds(c2.id)).toEqual([product.id]);
  });
});
