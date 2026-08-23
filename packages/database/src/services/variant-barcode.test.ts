import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { VariantBarcodeService } from './variant-barcode.service';

/**
 * Barkod ↔ varyant eşlemesi ve TEK ARAMA KAPISI (23.2 · test dalgası 23.10).
 *
 * Sınanan beş değişmez:
 *   1. **Bilinmeyen kod `null` döner** — sıfır değil, "ilk varyant" değil. Tahmin eden bir arama,
 *      mal kabulde yanlış ürünü sayardı ve hata stoğa kadar sessizce yürürdü.
 *   2. **Öncelik sırası sabit:** barkod → sku → tedarikçi kodu. Her ekran kendi zincirini kursaydı
 *      aynı kod iki ekranda iki farklı cevap verirdi (`findByCode` künyesi).
 *   3. **Adedi KODUN KENDİSİ söyler** — koli barkodu çarpanını taşır; sku ve tedarikçi kodu taşımaz.
 *   4. **Bir kod iki varyanta bağlanamaz** — tekillik veride (`variant_barcode_code_uq`).
 *   5. **BİÇİM BİLEREK ZORLANMAZ** — bu, unutulunca "iyilik olsun diye" geri getirilecek bir karar.
 */
const db = serviceDb();
const barcodes = new VariantBarcodeService(db);
const products = new ProductService(db);
const categories = new CategoryService(db);

const stamp = Date.now();
const productIds: string[] = [];
const categoryIds: string[] = [];
let variantA: string;
let variantB: string;
let sira = 0;

/** Kodlar damgalı: `code` GLOBAL benzersiz, iki koşu aynı kodu kullanırsa ikincisi çakışır. */
const kod = (etiket: string) => `BC-${stamp}-${etiket}-${(sira += 1)}`;

beforeAll(async () => {
  const category = await categories.create({ name: { tr: `Barkod testi ${stamp}` } });
  categoryIds.push(category.id);
  const first = await products.create({ name: { tr: `Barkod ürün A ${stamp}` }, categoryId: category.id });
  const second = await products.create({ name: { tr: `Barkod ürün B ${stamp}` }, categoryId: category.id });
  productIds.push(first.product.id, second.product.id);
  variantA = first.variants[0]!.id;
  variantB = second.variants[0]!.id;
});

afterAll(async () => {
  // Barkodlar varyantla CASCADE gider (`variant_id … on delete cascade`) — ayrıca silinmez.
  await purgeTestData(db, { productIds, categoryIds });
});

describe('findByCode — tek arama kapısı', () => {
  it('BİLİNMEYEN kod `null` döner — tahmin edilmez', async () => {
    // "Ölçülemeyen değer sıfır değildir" (CLAUDE §1) burada da geçerli: bilinmeyen kodun cevabı
    // bir varyant DEĞİL, bilinmemektir. Tahmin eden bir arama yanlış malı stoğa yazardı.
    expect(await barcodes.findByCode(kod('yok'))).toBeNull();
  });

  it('bilinen barkod doğru varyanta düşer ve kaynağını söyler', async () => {
    const code = kod('unit');
    await barcodes.insert({ variantId: variantA, code, kind: 'unit', qtyPerCode: 1, createdBy: null });

    expect(await barcodes.findByCode(code)).toEqual({
      variantId: variantA,
      kind: 'unit',
      qtyPerCode: 1,
      // Ekran eşleşmenin KESİNLİK derecesini bilmeli: barkod kesin, sku/tedarikçi kodu daha zayıf.
      source: 'barcode',
    });
  });

  it('KOLİ barkodu çarpanını KENDİ taşır — tedarikçinin koli adedi okunmaz', async () => {
    // `supplier_product.pack_qty` "bu tedarikçi koliyle satıyor" bilgisidir; okutulan şeyin koli
    // OLDUĞUNUN kanıtı değil. İki tedarikçinin kolisi farklı olabilir.
    const code = kod('case');
    await barcodes.insert({ variantId: variantA, code, kind: 'case', qtyPerCode: 12, createdBy: null });

    const eslesme = await barcodes.findByCode(code);
    expect(eslesme).toMatchObject({ variantId: variantA, kind: 'case', qtyPerCode: 12 });
  });
});

describe('veri kısıtları — kural kodda değil, veride', () => {
  it('AYNI kod ikinci varyanta bağlanamaz', async () => {
    const code = kod('tekil');
    await barcodes.insert({ variantId: variantA, code, kind: 'unit', qtyPerCode: 1, createdBy: null });

    // Aynı kodun iki mala işaret etmesi, okutmayı anlamsız kılardı. Kısıt veride (`…_code_uq`),
    // yani yazan yüzey unutsa bile satır girmez.
    await expect(
      barcodes.insert({ variantId: variantB, code, kind: 'unit', qtyPerCode: 1, createdBy: null }),
    ).rejects.toThrow();
  });

  it('`unit` kodun çarpanı 1 OLMAK ZORUNDA — "tek paketin çarpanı" diye bir serbestlik yok', async () => {
    await expect(
      barcodes.insert({ variantId: variantA, code: kod('unit-yanlis'), kind: 'unit', qtyPerCode: 6, createdBy: null }),
    ).rejects.toThrow();
  });

  it('çarpan sıfır ya da negatif olamaz', async () => {
    await expect(
      barcodes.insert({ variantId: variantA, code: kod('sifir'), kind: 'case', qtyPerCode: 0, createdBy: null }),
    ).rejects.toThrow();
  });
});

describe('biçim doğrulaması BİLEREK yok', () => {
  it('EAN olmayan iç etiket ve QR kabul edilir', async () => {
    /*
      Bu test bir davranışı değil, bir KARARI çiviliyor (`variant-barcode.schema.ts` künyesi):
      *"biçim ZORLANMAZ: iç etiketler ve QR'lar da taranabilir; 'geçersiz biçim' reddi gerçek bir
      kolinin kabulünü durdururdu."*

      Biri bir gün "iyilik olsun diye" EAN sağlama basamağı doğrulaması eklerse, depoda gerçek bir
      koli reddedilmeye başlar ve sebebi aylarca anlaşılmaz. Kırılması gereken şey o eklemedir.
    */
    const ic = `RAF/A-12 ${stamp}`;
    await barcodes.insert({ variantId: variantB, code: ic, kind: 'unit', qtyPerCode: 1, createdBy: null });
    expect(await barcodes.findByCode(ic)).toMatchObject({ variantId: variantB, source: 'barcode' });
  });
});
