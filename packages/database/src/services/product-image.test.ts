import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { ProductImageService } from './product-image.service';
import { ProductService } from './product.service';

/**
 * Ürün galerisi (05.10) — DB üstünde. Asıl konu KAPAK TAKASI: kapak `product` satırında, galeri ayrı
 * tabloda duruyor; "bunu kapak yap" ikisine birden yazıyor. Yanlış kurulursa sonuç sessiz veri kaybı
 * olur (eski kapak dosyası hiçbir yerde kalmaz) — tip denetimi bunu görmez, ancak gerçek sorgu görür.
 */
const db = serviceDb();
const products = new ProductService(db);
const categories = new CategoryService(db);
const images = new ProductImageService(db);

let productId: string;
let categoryId: string;

beforeAll(async () => {
  const category = await categories.create({ name: { tr: `Galeri testi ${Date.now()}` } });
  const { product } = await products.create({ name: { tr: `Galeri ürünü ${Date.now()}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
});

afterAll(async () => {
  await products.delete(productId).catch(() => {}); // galeri satırları CASCADE ile gider
  await categories.delete(categoryId).catch(() => {});
});

/** Her senaryo kendi zeminini kurar: galeriyi boşaltır, kapağı verilen anahtara çeker. */
async function reset(coverKey: string | null): Promise<void> {
  for (const img of await images.listByProduct(productId)) await images.delete(img.id);
  await products.update({ id: productId, imageKey: coverKey, imageFocalX: 50, imageFocalY: 50, imageZoom: 100, imageUpdatedAt: null });
}

describe('ProductImageService — galeri', () => {
  it('eklenen fotoğraf SONA gider ve sürüm damgası alır', async () => {
    await reset(null);
    const first = await images.add(productId, 'catalog/products/g-1.jpeg');
    const second = await images.add(productId, 'catalog/products/g-2.jpeg');

    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
    expect(second.imageUpdatedAt).not.toBeNull(); // damgasız kayıt public URL'i sürümleyemez
    expect((await images.listByProduct(productId)).map((i) => i.imageKey)).toEqual([
      'catalog/products/g-1.jpeg',
      'catalog/products/g-2.jpeg',
    ]);
  });

  it('odak/zoom yazılır ama sürüm damgası DEĞİŞMEZ (dosya değişmedi)', async () => {
    await reset(null);
    const img = await images.add(productId, 'catalog/products/g-1.jpeg');

    const edited = await images.setCrop(img.id, { imageFocalX: 20, imageFocalY: 80, imageZoom: 160 });
    expect(edited).toMatchObject({ imageFocalX: 20, imageFocalY: 80, imageZoom: 160 });
    expect(edited.imageUpdatedAt).toBe(img.imageUpdatedAt);
  });

  it('sürükle-bırak sırası yazılır', async () => {
    await reset(null);
    const a = await images.add(productId, 'catalog/products/g-1.jpeg');
    const b = await images.add(productId, 'catalog/products/g-2.jpeg');
    const c = await images.add(productId, 'catalog/products/g-3.jpeg');

    await images.reorder([c.id, a.id, b.id]);
    expect((await images.listByProduct(productId)).map((i) => i.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe('ProductService.makeCover — takas', () => {
  it('kapak varsa TAKAS olur: eski kapak galeride aynı sıraya oturur, künyesi korunur', async () => {
    await reset('catalog/products/kapak.jpeg');
    await products.update({ id: productId, imageFocalX: 10, imageFocalY: 90, imageZoom: 200 });
    const ilk = await images.add(productId, 'catalog/products/g-1.jpeg');
    const hedef = await images.add(productId, 'catalog/products/g-2.jpeg');
    await images.setCrop(hedef.id, { imageFocalX: 30, imageFocalY: 70, imageZoom: 140 });

    const after = await products.makeCover(productId, hedef.id);

    // Yeni kapak = seçilen fotoğraf, ODAĞIYLA birlikte (odak fotoğrafa aittir, çerçeveye değil).
    expect(after).toMatchObject({ imageKey: 'catalog/products/g-2.jpeg', imageFocalX: 30, imageFocalY: 70, imageZoom: 140 });

    // Eski kapak kaybolmadı: hedefin sırasında, kendi künyesiyle duruyor.
    const gallery = await images.listByProduct(productId);
    expect(gallery.map((i) => i.imageKey)).toEqual(['catalog/products/g-1.jpeg', 'catalog/products/kapak.jpeg']);
    expect(gallery[1]).toMatchObject({ id: hedef.id, imageFocalX: 10, imageFocalY: 90, imageZoom: 200 });
    expect(ilk.sortOrder).toBeLessThan(gallery[1]!.sortOrder);
  });

  it('kapak yoksa fotoğraf galeriden ÇIKAR (aynı dosya iki yerde görünmez)', async () => {
    await reset(null);
    const only = await images.add(productId, 'catalog/products/g-1.jpeg');

    const after = await products.makeCover(productId, only.id);

    expect(after.imageKey).toBe('catalog/products/g-1.jpeg');
    expect(await images.listByProduct(productId)).toEqual([]);
  });

  it('başka ürünün fotoğrafı kapak yapılamaz', async () => {
    await reset(null);
    const other = await products.create({ name: { tr: `Yabancı ${Date.now()}` }, categoryId });
    const foreign = await images.add(other.product.id, 'catalog/products/g-9.jpeg');

    await expect(products.makeCover(productId, foreign.id)).rejects.toThrow(/ait değil/);
    await products.delete(other.product.id);
  });
});
