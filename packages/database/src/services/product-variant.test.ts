import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveLocalizedText } from '@lezzet/types';
import { serviceDb } from '../client';
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

const damga = Date.now();
let productId: string;
let categoryId: string;

beforeAll(async () => {
  const category = await categories.create({ name: { tr: `Varyant testi ${damga}` } });
  const { product } = await products.create({
    name: { tr: `Varyant ürünü ${damga}` },
    categoryId: category.id,
    variants: [{ label: { tr: '500 g', fr: '500 g' }, netWeightG: 500, minStockQty: 10 }],
  });
  categoryId = category.id;
  productId = product.id;
});

afterAll(async () => {
  // Temizlik SIRALI olmak zorunda: bu testin son senaryosu bir varyanta stok partisi ekliyor ve parti
  // varyant silmeyi ENGELLİYOR (`restrict`) — ürün silme, cascade varyanta çarptığı yerde reddediliyor.
  // Sıra bozulunca temizlik ilk adımda patlıyor ve testin ürettiği satırlar veritabanında BİRİKİYOR
  // (operasyon ekranında çöp ürün olarak görünürler).
  if (productId) {
    for (const v of await variants.listByProduct(productId)) {
      for (const parti of await stocks.listByVariant(v.id)) await stocks.delete(parti.id);
    }
    await products.delete(productId);
  }
  if (categoryId) await categories.delete(categoryId);
});

describe('ProductVariantService.syncVariants', () => {
  it('boy etiketini üç dilde saklar ve min. stok eşiğini yazar', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const sonuc = await variants.syncVariants(productId, [
      {
        id: mevcut?.id,
        label: { tr: '700 g tepsi', fr: 'plateau 700 g', de: 'Platte 700 g' },
        netWeightG: 700,
        minStockQty: 6,
        sku: 'TST-700',
        isActive: true,
      },
    ]);

    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]?.label).toEqual({ tr: '700 g tepsi', fr: 'plateau 700 g', de: 'Platte 700 g' });
    expect(sonuc[0]?.minStockQty).toBe(6);
    // Yedek zinciri: Almanca istenince Almanca gelir (tek dile düşmüyor).
    expect(resolveLocalizedText(sonuc[0]!.label, 'de')).toBe('Platte 700 g');
  });

  it('etiketi yalnız bir dilde dolu bırakılabilir — eksik dil kayda engel değil', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const sonuc = await variants.syncVariants(productId, [
      { id: mevcut?.id, label: { tr: 'Tepsi' }, netWeightG: 700, minStockQty: 6, sku: 'TST-700', isActive: true },
    ]);
    expect(sonuc[0]?.label).toEqual({ tr: 'Tepsi' });
  });

  it('sıra form dizisinin KONUMUNDAN yazılır (müşterinin gördüğü boy sırası)', async () => {
    const [mevcut] = await variants.listByProduct(productId);
    const ilk = { id: mevcut?.id, label: { tr: 'Tepsi' }, netWeightG: 700, minStockQty: 6, sku: 'TST-700', isActive: true };
    const yeni = { label: { tr: '1 kg' }, netWeightG: 1000, minStockQty: null, sku: 'TST-1000', isActive: true };

    const eklendi = await variants.syncVariants(productId, [ilk, yeni]);
    expect(eklendi.map((v) => resolveLocalizedText(v.label))).toEqual(['Tepsi', '1 kg']);
    expect(eklendi.map((v) => v.sortOrder)).toEqual([0, 1]);

    // Sürükle-bırak diziyi taşır; servis indeksi yeniden yazar.
    const taşındı = await variants.syncVariants(productId, [
      { ...yeni, id: eklendi[1]?.id },
      { ...ilk, id: eklendi[0]?.id },
    ]);
    expect(taşındı.map((v) => resolveLocalizedText(v.label))).toEqual(['1 kg', 'Tepsi']);
    expect(taşındı.map((v) => v.sortOrder)).toEqual([0, 1]);
    // Sıra listeye de yansır (okuma sortOrder'a göre).
    const okunan = await variants.listByProduct(productId);
    expect(okunan.map((v) => resolveLocalizedText(v.label))).toEqual(['1 kg', 'Tepsi']);
  });

  it('listeden çıkan varyant silinir; fiyat satırı onunla birlikte gider (cascade)', async () => {
    const okunan = await variants.listByProduct(productId);
    const silinecek = okunan[1]!;
    await prices.setPrice({ variantId: silinecek.id, channel: 'b2c', amount: 12.5 });
    expect(await prices.listByVariant(silinecek.id)).toHaveLength(1);

    await variants.syncVariants(productId, [
      { id: okunan[0]!.id, label: okunan[0]!.label, netWeightG: null, minStockQty: null, sku: null, isActive: true },
    ]);

    expect((await variants.listByProduct(productId)).map((v) => v.id)).toEqual([okunan[0]!.id]);
    expect(await prices.listByVariant(silinecek.id)).toHaveLength(0);
  });

  it('stok partisi olan varyant silinemez — hata OKUNABİLİR cümleye çevrilir', async () => {
    const eklendi = await variants.syncVariants(productId, [
      { id: (await variants.listByProduct(productId))[0]?.id, label: { tr: '1 kg' }, netWeightG: 1000, minStockQty: null, sku: null, isActive: true },
      { label: { tr: 'Kutu' }, netWeightG: 250, minStockQty: null, sku: null, isActive: true },
    ]);
    const stoklu = eklendi[1]!;
    await stocks.insert({ variantId: stoklu.id, physicalQty: 4, expiryDate: '2030-01-01' });

    const kalan = [{ id: eklendi[0]!.id, label: eklendi[0]!.label, netWeightG: null, minStockQty: null, sku: null, isActive: true }];
    await expect(variants.syncVariants(productId, kalan)).rejects.toThrow(/«Kutu» silinemedi.*stok partisi/s);

    // Engellenen varyant YERİNDE kalır — yarım kalan senkron veriyi bozmaz.
    expect((await variants.listByProduct(productId)).some((v) => v.id === stoklu.id)).toBe(true);
  });
});
