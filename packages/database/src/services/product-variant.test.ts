import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProductVariantEntry } from '@lezzet/types';
import { resolveLocalizedText } from '@lezzet/types';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { PriceService } from './price.service';
import { ProductService } from './product.service';
import { ProductVariantService } from './product-variant.service';
import { StockService } from './stock.service';

/**
 * Varyant senkronu (05.10) — DB üstünde. İki riskli davranış burada sınanır:
 *
 *   1. **Boy etiketi çok dilli** (`label` jsonb). Tek dil kaldığı sürece üç dilli vitrinde Fransız
 *      müşteri Türkçe boy adı okuyordu.
 *   2. **Silme.** `syncVariants` listeden çıkan satırı SİLER; şema bilerek iki farklı davranıyor —
 *      fiyat satırı varyantla gider (cascade), stok partisi silmeyi engeller (restrict). İkisi de
 *      doğru; sınanan şey engelin OKUNABİLİR bir cümleye çevrilmesi, çünkü ham "violates foreign key
 *      constraint" metni operatöre ne olduğunu da ne yapacağını da söylemiyor.
 */
const db = serviceDb();
const products = new ProductService(db);
const categories = new CategoryService(db);
const variants = new ProductVariantService(db);
const prices = new PriceService(db);
const stocks = new StockService(db);

const stamp = Date.now();
let productId: string;
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'VAR' })).id;
  const category = await categories.create({ name: { tr: `Varyant testi ${stamp}` } });
  const { product } = await products.create({
    name: { tr: `Varyant ürünü ${stamp}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g', fr: '500 g' }, netWeightG: 500, minStockQty: 10 }],
  });
  categoryId = category.id;
  productId = product.id;
});

// Temizlik ORTAK yardımcıyla: silme sırası tek yerde yaşıyor (`restrict` FK'ler yüzünden parti duran
// varyant silinemez → ürün silme cascade'i orada reddedilir). Bu testin son senaryosu bilerek stok
// partisi bırakıyor, yani sıra burada gerçekten gerekiyor; ama sırayı kendimiz uydurmuyoruz.
afterAll(async () => {
  await purgeTestData(db, {
    productIds: [productId].filter(Boolean),
    categoryIds: [categoryId].filter(Boolean),
    warehouseIds: [warehouseId],
  });
});

/**
 * Form satırı üreticisi — testin YALNIZ sınadığı alanı yazmasını sağlar.
 *
 * `ProductVariantEntry` alanları bilerek ZORUNLU (künyesi şemada): alanı göstermeyen bir yazan,
 * üretecin bulduğu değeri her kayıtta ezerdi. Ama o disiplin fikstürlerde on kez beş `null`
 * yazdırmak anlamına geliyordu ve okunan şey sınanan şey olmaktan çıkıyordu.
 */
function entry(over: Partial<ProductVariantEntry> = {}): ProductVariantEntry {
  return {
    label: {},
    netWeightG: null,
    piecesCount: null,
    portionKind: null,
    packedWeightG: null,
    packedLengthMm: null,
    packedWidthMm: null,
    packedHeightMm: null,
    minStockQty: null,
    sku: null,
    isActive: true,
    ...over,
  };
}

describe('ProductVariantService.syncVariants', () => {
  it('boy etiketini üç dilde saklar ve min. stok eşiğini yazar', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const outcome = await variants.syncVariants(productId, [
      entry({
        id: mevcut?.id,
        label: { tr: '700 g tepsi', fr: 'plateau 700 g', de: 'Platte 700 g' },
        netWeightG: 700,
        // Adet gramajın YANINDA yaşıyor (05.14): aynı varyant hem 12 parça hem 700 g olabilir.
        piecesCount: 12,
        minStockQty: 6,
        sku: 'TST-700',
      }),
    ]);

    expect(outcome).toHaveLength(1);
    expect(outcome[0]?.label).toEqual({ tr: '700 g tepsi', fr: 'plateau 700 g', de: 'Platte 700 g' });
    expect(outcome[0]?.minStockQty).toBe(6);
    expect(outcome[0]?.piecesCount).toBe(12);
    expect(outcome[0]?.netWeightG).toBe(700);
    // Yedek zinciri: Almanca istenince Almanca gelir (tek dile düşmüyor).
    expect(resolveLocalizedText(outcome[0]!.label, 'de')).toBe('Platte 700 g');
  });

  it('etiketi yalnız bir dilde dolu bırakılabilir — eksik dil kayda engel değil', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const outcome = await variants.syncVariants(productId, [
      entry({ id: mevcut?.id, label: { tr: 'Tepsi' }, netWeightG: 700, minStockQty: 6, sku: 'TST-700' }),
    ]);
    expect(outcome[0]?.label).toEqual({ tr: 'Tepsi' });
    // Adet BİLDİRİLMEMİŞ (dökme ürün) — `null` sıfıra çevrilmez.
    expect(outcome[0]?.piecesCount).toBeNull();
  });

  it('sıra form dizisinin KONUMUNDAN yazılır (müşterinin gördüğü boy sırası)', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const first = entry({ id: mevcut?.id, label: { tr: 'Tepsi' }, netWeightG: 700, minStockQty: 6, sku: 'TST-700' });
    const created = entry({ label: { tr: '1 kg' }, netWeightG: 1000, sku: 'TST-1000' });

    const added = await variants.syncVariants(productId, [first, created]);
    expect(added.map((v) => resolveLocalizedText(v.label))).toEqual(['Tepsi', '1 kg']);
    expect(added.map((v) => v.sortOrder)).toEqual([0, 1]);

    // Sürükle-bırak diziyi taşır; servis indeksi yeniden yazar.
    const taşındı = await variants.syncVariants(productId, [
      { ...created, id: added[1]?.id },
      { ...first, id: added[0]?.id },
    ]);
    expect(taşındı.map((v) => resolveLocalizedText(v.label))).toEqual(['1 kg', 'Tepsi']);
    expect(taşındı.map((v) => v.sortOrder)).toEqual([0, 1]);
    // Sıra listeye de yansır (okuma sortOrder'a göre).
    const loaded = await variants.listByProduct(productId);
    expect(loaded.map((v) => resolveLocalizedText(v.label))).toEqual(['1 kg', 'Tepsi']);
  });

  it('listeden çıkan varyant silinir; fiyat satırı onunla birlikte gider (cascade)', async () => {
    const loaded = await variants.listByProduct(productId);
    const toDelete = loaded[1]!;
    await prices.setPrice({ variantId: toDelete.id, channel: 'b2c', amountCents: 1250 });
    expect(await prices.listByVariant(toDelete.id)).toHaveLength(1);

    await variants.syncVariants(productId, [
      entry({ id: loaded[0]!.id, label: loaded[0]!.label }),
    ]);

    expect((await variants.listByProduct(productId)).map((v) => v.id)).toEqual([loaded[0]!.id]);
    expect(await prices.listByVariant(toDelete.id)).toHaveLength(0);
  });

  it('ambalaj ölçüsü yazılır ve geri okunur — kargo tarifesinin girdisi', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const outcome = await variants.syncVariants(productId, [
      entry({
        id: mevcut?.id,
        label: { tr: 'Tepsi' },
        // Net ağırlık BEYAN, brüt ağırlık TAŞINAN — ikisi ayrı alanda ve ayrı sayı.
        netWeightG: 700,
        packedWeightG: 780,
        packedLengthMm: 240,
        packedWidthMm: 165,
        packedHeightMm: 60,
      }),
    ]);
    expect(outcome[0]).toMatchObject({
      netWeightG: 700,
      packedWeightG: 780,
      packedLengthMm: 240,
      packedWidthMm: 165,
      packedHeightMm: 60,
    });
  });

  it('yalnız TARTILMIŞ varyant geçerlidir — ölçü beklemek yarım ilerlemeyi engellerdi', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const outcome = await variants.syncVariants(productId, [
      entry({ id: mevcut?.id, label: { tr: 'Tepsi' }, packedWeightG: 780 }),
    ]);
    expect(outcome[0]?.packedWeightG).toBe(780);
    expect(outcome[0]?.packedLengthMm).toBeNull();
  });

  it('YARIM ÖLÇÜ veritabanınca REDDEDİLİR — kural ekranda değil veride duruyor', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    // İkisi dolu biri boş bir kutu hiçbir soruya cevap vermez: hacim hesaplanamaz, taşıyıcıya
    // gönderilemez, ama ekran "ölçüsü var" diye okur. Ekran unutabilir, veritabanı unutmaz.
    await expect(
      variants.syncVariants(productId, [
        entry({ id: mevcut?.id, label: { tr: 'Tepsi' }, packedLengthMm: 240, packedWidthMm: 165 }),
      ]),
    ).rejects.toThrow(/packed_dims_all_or_none/);
  });

  it('SIFIR ölçü ÇİFT KAT reddedilir — "0 g" ölçüm değil, ölçülmemişliğin yanlış yazılmış hâli', async () => {
    // İlk kapı şemadır (`positive()`), ikincisi veritabanı kısıtı. Bu koşuda düşen ŞEMA — ama
    // ikisi de yerinde durmalı: şemayı atlayan bir yazan (onarım betiği, doğrudan SQL) kısıta
    // çarpar. Tek kat savunma, ikinci yazma yolu açıldığı gün delinir (MB-22a dersi).
    const [mevcut] = await variants.listByProduct(productId);
    await expect(
      variants.syncVariants(productId, [entry({ id: mevcut?.id, label: { tr: 'Tepsi' }, packedWeightG: 0 })]),
    ).rejects.toThrow();
  });

  it('porsiyon türü artık FORMDAN yazılıyor — bir tur yalnız besleme yazabiliyordu', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const outcome = await variants.syncVariants(productId, [
      entry({ id: mevcut?.id, label: { tr: 'Cheesecake' }, piecesCount: 12, portionKind: 'slice' }),
    ]);
    // "12 dilim" ile "12 adet" aynı şey değil: vitrin ikisine aynı kelimeyi yazarsa müşteri
    // 12 cheesecake aldığını sanır (19.08 ölçümü).
    expect(outcome[0]).toMatchObject({ piecesCount: 12, portionKind: 'slice' });
  });

  it('stok partisi olan varyant silinemez — hata OKUNABİLİR cümleye çevrilir', async () => {
    const added = await variants.syncVariants(productId, [
      entry({ id: (await variants.listByProduct(productId))[0]?.id, label: { tr: '1 kg' }, netWeightG: 1000 }),
      entry({ label: { tr: 'Kutu' }, netWeightG: 250 }),
    ]);
    const withStock = added[1]!;
    await stocks.insert({ variantId: withStock.id, warehouseId, physicalQty: 4, expiryDate: '2030-01-01' });

    const remaining = [
      entry({ id: added[0]!.id, label: added[0]!.label }),
    ];
    await expect(variants.syncVariants(productId, remaining)).rejects.toThrow(/«Kutu» silinemedi.*stok partisi/s);

    // Engellenen varyant YERİNDE kalır — yarım kalan senkron veriyi bozmaz.
    expect((await variants.listByProduct(productId)).some((v) => v.id === withStock.id)).toBe(true);
  });
});
