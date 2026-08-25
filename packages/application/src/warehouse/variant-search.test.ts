import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, ProductService, VariantBarcodeService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { searchVariantsForIntake } from './variant-search';

/**
 * **Plansız kabulün ürün araması** (23.13) — PO'suz gelen malda satır kümesi yoktur, depocu ürünü
 * kendisi seçer. Kapının iki halkası var ve SIRALARI karar: kod önce, ad sonra.
 *
 * Neden uçtan sınanıyor: sıra bozulursa (ad önce) okutulan bir barkod, adı benzeyen ONLARCA ürünün
 * arasında kaybolur ve depocu yanlış boyu seçebilir — hata kabulde değil, HAFTALAR SONRA stok
 * sayımında görülür. `variant_barcode` satırları ayrıca silinmez: varyant FK'sı cascade
 * (`scan.test.ts` ile aynı kural — elle silme yok, `cleanup.ts`).
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
/** Aranan ürünün iki boyu: ad araması İKİSİNİ birden döndürmeli (biri gizlenirse depocu şaşırır). */
let variantId: string;
let otherVariantId: string;

/** Ada asla uymayan, benzersiz bir sözcük — ad araması bu ürünü yalnız kendi adıyla bulmalı. */
const NAME = `Zzkatmerli ${stamp}`;
/* Damgalı kodlar: paralel şeritlerin satırlarıyla çakışmasın. Sağlama basamağı GEÇERSİZ ve bu
   bilinçli — `variant_barcode` biçim zorlamıyor (iç etiketler de taranabilir, şema künyesi) ve
   arama kapısı da zorlamamalı; geçerlilik yalnız KÂĞIDA basılan setin şartı (`barcode-svg`). */
const UNIT_CODE = `9${String(stamp).slice(-12)}`;
const CASE_CODE = `19${String(stamp).slice(-12)}`;

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Arama ${stamp}` } });
  const { product, variants } = await new ProductService(db).create({
    name: { tr: NAME },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g' }, sku: `ARA-${stamp}` }, { label: { tr: '1 kg' } }],
  });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  otherVariantId = variants[1]!.id;

  const barcodes = new VariantBarcodeService(db);
  await barcodes.insert({ variantId, code: UNIT_CODE });
  await barcodes.insert({ variantId: otherVariantId, code: CASE_CODE, kind: 'case', qtyPerCode: 24 });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId] });
});

describe('plansız kabul · ürün araması', () => {
  it('KOD eşleşirse ada hiç bakılmaz — tek satır, kesin kimlik', async () => {
    // Kod kesin kimliktir, ad tahmindir: kodla arama yapan depocu tek bir cevap görmeli.
    const rows = await searchVariantsForIntake(db, { query: UNIT_CODE });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantId).toBe(variantId);
  });

  it('KOLİ kodu çarpanını taşır — okutmanın kaç adet saydığı aramada da görünür', async () => {
    const rows = await searchVariantsForIntake(db, { query: CASE_CODE });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.variantId).toBe(otherVariantId);
    // Ad aramasında `null` olan alan, kod eşleşmesinde DOLU: ekran "1 okutma = 24 adet" diyebilsin.
    expect(rows[0]?.qtyPerCode).toBe(24);
  });

  it('AD araması ürünün TÜM boylarını döndürür — biri eksik kalırsa depocu listede bulamaz', async () => {
    const rows = await searchVariantsForIntake(db, { query: NAME });
    const bulunan = rows.filter((row) => row.variantId === variantId || row.variantId === otherVariantId);

    expect(bulunan).toHaveLength(2);
    // Ad aramasında çarpan YOKTUR: hangi kodun okutulduğu bilinmiyor, uydurulmaz.
    expect(bulunan.every((row) => row.qtyPerCode === null)).toBe(true);
    // SKU satırın künyesinde taşınır (ekran onu ikinci satırda yazıyor).
    expect(bulunan.some((row) => row.sku === `ARA-${stamp}`)).toBe(true);
  });

  it('adın PARÇASI da bulur — depocu tam adı yazmak zorunda değil', async () => {
    const rows = await searchVariantsForIntake(db, { query: 'zzkatmerli' });

    expect(rows.some((row) => row.variantId === variantId)).toBe(true);
  });

  it('BOŞ sorgu boş liste döner — "henüz yazmadın" bir hata değil', async () => {
    expect(await searchVariantsForIntake(db, { query: '' })).toEqual([]);
    expect(await searchVariantsForIntake(db, { query: '   ' })).toEqual([]);
  });

  it('eşleşmeyen sorgu BOŞ döner — tahmin eden bir arama yanlış malı stoğa yazardı', async () => {
    expect(await searchVariantsForIntake(db, { query: `yokboyleurun-${stamp}` })).toEqual([]);
  });

  it('PARA taşımaz — depo yolu fiyat görmez (09.14)', async () => {
    const rows = await searchVariantsForIntake(db, { query: NAME });

    // Alan adı sızıntısı da ölçülüyor: satıra bir gün "price" eklenirse burada yakalanır.
    for (const row of rows) {
      expect(Object.keys(row).join(',')).not.toMatch(/price|amount|cost|tutar|fiyat/i);
    }
  });
});
