import { afterAll, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '../client';
import { ProductFamilyService, ProductService } from './product.service';

/**
 * Ürün ailesi — çeşit ekseni (05.15).
 *
 * **Sınanan şey bir liste değil, ÜÇ DEĞİŞMEZ:**
 *  1. bir ürün en çok BİR ailede olabilir (kolon, junction değil),
 *  2. aileye giren ürünün ETİKETİ zorunludur (veri kısıtı),
 *  3. sıra aile İÇİNDEDİR ve katalog sırasından (`sortOrder`) bağımsızdır.
 *
 * Üçü de ekranda unutulduğunda hata vermeyen, yalnız yanlış görünen türden kurallar — o yüzden
 * kural veride duruyor ve testi de burada.
 */
const db = createServiceRoleClient();
const products = new ProductService(db);
const families = new ProductFamilyService(db);

const stamp = Date.now();
const productIds: string[] = [];
const familyIds: string[] = [];

afterAll(async () => {
  for (const id of productIds) await products.delete(id).catch(() => {});
  for (const id of familyIds) await families.delete(id).catch(() => {});
});

async function urun(ad: string, sortOrder: number) {
  const { product } = await products.create({ name: { tr: `${ad} ${stamp}` }, sortOrder });
  productIds.push(product.id);
  return product;
}

describe('ürün ailesi', () => {
  it('ETİKETSİZ üye REDDEDİLİR — kural veride, ekranda unutulunca hata versin diye', async () => {
    const aile = await families.insert({ name: `Kek ailesi ${stamp}` });
    familyIds.push(aile.id);
    const p = await urun('Limonlu kek', 1);

    // Ekranda unutulsaydı kart ürün adına düşer ("Limonlu kek" yazar) ve DOĞRU GÖRÜNÜRDÜ —
    // kısa etiketin bütün amacı sessizce kaybolurdu. Gürültülü hata, sessiz kayıptan iyidir.
    await expect(products.update({ id: p.id, familyId: aile.id })).rejects.toThrow();
  });

  it('etiketle birlikte KABUL edilir ve üç dili taşır', async () => {
    const aile = await families.insert({ name: `Börek ailesi ${stamp}` });
    familyIds.push(aile.id);
    const p = await urun('Peynirli börek', 2);

    const guncel = await products.update({
      id: p.id,
      familyId: aile.id,
      familyLabel: { tr: 'Peynirli', fr: 'Fromage', de: 'Käse' },
      familyPosition: 0,
    });

    expect(guncel.familyId).toBe(aile.id);
    // Etiket ürün ADINDAN AYRI: ürün "Peynirli börek", kart "Peynirli".
    expect(guncel.familyLabel).toEqual({ tr: 'Peynirli', fr: 'Fromage', de: 'Käse' });
  });

  it('üyeler AİLE SIRASINA göre gelir — katalog sırası (`sortOrder`) karışmaz', async () => {
    const aile = await families.insert({ name: `Baklava ailesi ${stamp}` });
    familyIds.push(aile.id);

    // Katalog sırası ters: cevizli 90, fıstıklı 10. Aile sırası ise fıstıklı 0, cevizli 1.
    const cevizli = await urun('Cevizli baklava', 90);
    const fistikli = await urun('Fıstıklı baklava', 10);
    await products.update({ id: cevizli.id, familyId: aile.id, familyLabel: { tr: 'Cevizli' }, familyPosition: 1 });
    await products.update({ id: fistikli.id, familyId: aile.id, familyLabel: { tr: 'Fıstıklı' }, familyPosition: 0 });

    const uyeler = await products.listFamilyMembers(aile.id);
    // İki kolonu tek kolona bağlasaydık (sortOrder'ı kullansaydık) sıra 10 → 90 çıkardı: operatör
    // ailedeki sırayı değiştirirken katalog sırasını da farkında olmadan değiştirmiş olurdu.
    expect(uyeler.map((u) => u.id)).toEqual([fistikli.id, cevizli.id]);
    expect(uyeler.map((u) => u.sortOrder)).toEqual([10, 90]);
  });

  it('sıra TÜM AİLE için birden yazılır — kısmi güncelleme delik bırakırdı', async () => {
    const aile = await families.insert({ name: `Kadayıf ailesi ${stamp}` });
    familyIds.push(aile.id);
    const a = await urun('Sade kadayıf', 1);
    const b = await urun('Fıstıklı kadayıf', 2);
    for (const [i, p] of [a, b].entries()) {
      await products.update({ id: p.id, familyId: aile.id, familyLabel: { tr: `E${i}` }, familyPosition: i });
    }

    await products.reorderFamily([
      { productId: b.id, position: 0 },
      { productId: a.id, position: 1 },
    ]);

    expect((await products.listFamilyMembers(aile.id)).map((u) => u.id)).toEqual([b.id, a.id]);
  });

  it('AİLE SİLİNİNCE üyeler ürün olarak yaşar — ama etiket de düşmeli', async () => {
    const aile = await families.insert({ name: `Geçici aile ${stamp}` });
    const p = await urun('Geçici üye', 3);
    await products.update({ id: p.id, familyId: aile.id, familyLabel: { tr: 'Geçici' }, familyPosition: 0 });

    await families.delete(aile.id);

    // `on delete set null`: ürün duruyor, ailesi düştü. Etiket satırda kalıyor ama artık okunmuyor —
    // kısıt yalnız "aile varsa etiket olsun" diyor, tersini zorlamıyor. Ürün yeniden bir aileye
    // konursa etiket ZORUNLU olarak yeniden yazılır, yani bayat değer sessizce kullanılamaz.
    const kalan = await products.getById(p.id);
    expect(kalan?.familyId).toBeNull();
  });
});
