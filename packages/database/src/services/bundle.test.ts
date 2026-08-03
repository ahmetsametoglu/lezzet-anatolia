import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bundleBalance } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import { serviceDb } from '../client';
import { createTestWarehouse } from '../testing/warehouse';
import { purgeTestData } from '../testing/cleanup';
import { BundleService } from './bundle.service';
import { CategoryService } from './category.service';
import { PriceService } from './price.service';
import { ProductService } from './product.service';
import { StockService } from './stock.service';

/**
 * Paket (05.5) — DB üstünde. Paket bir katalog kısayoludur: yeni ürün yaratmaz, kalemleri varyantlara
 * bağlıdır ve müşteriye TEK fiyat gösterir. Sınananlar riskli olanlar:
 *
 *   · kalemler TEK sorquda gelir (liste her satırda "N kalem" + mutabakat rozeti hesaplıyor → N+1 olmaz)
 *   · aynı varyant iki kez EKLENEMEZ (adet artırılır) ve hata okunabilir
 *   · senkron sırayı yazar (müşterinin paket içeriğinde gördüğü sıra)
 *   · hediye kalem = 0 fiyat, kaydedilebilir
 *   · mutabakat: Σ(atanmış × adet) = paket fiyatı — kararı motor verir, servis satırı taşır
 */
const db = serviceDb();
const bundles = new BundleService(db);
const products = new ProductService(db);
const categories = new CategoryService(db);

const stamp = Date.now();
let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let productId: string;
let variantA: string;
let variantB: string;
const bundleIds: string[] = [];

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'PKT' })).id;
  const category = await categories.create({ name: { tr: `Paket testi ${stamp}` } });
  const { product, variants } = await products.create({
    name: { tr: `Paket ürünü ${stamp}` },
    categoryId: category.id,
    variants: [
      { label: { tr: '500 g' }, netWeightG: 500 },
      { label: { tr: '1 kg' }, netWeightG: 1000 },
    ],
  });
  categoryId = category.id;
  productId = product.id;
  variantA = variants[0]!.id;
  variantB = variants[1]!.id;
});

afterAll(async () => {
  // Paketler ÜRÜNDEN ÖNCE gider: kalemler varyanta `restrict` ile bağlı, ürün silme cascade'i orada
  // reddedilirdi. (Ortak `purgeTestData` ürün grafiğini toplar; paket onun kapsamında değil.)
  for (const id of bundleIds) await bundles.delete(id);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

async function createBundle(name: string, totalPrice: number, items: Array<{ variantId: string; qty: number; allocatedUnitPrice: number }>) {
  const { bundle } = await bundles.create({ name: { tr: name }, totalPrice, items });
  bundleIds.push(bundle.id);
  return bundle;
}

describe('BundleService', () => {
  it('paketi kalemleriyle açar; slug addan türer', async () => {
    const bundle = await createBundle(`Bayram Sofrası ${stamp}`, 49.9, [
      { variantId: variantA, qty: 2, allocatedUnitPrice: 10 },
      { variantId: variantB, qty: 1, allocatedUnitPrice: 29.9 },
    ]);

    expect(bundle.slug).toContain('bayram-sofrasi');
    expect(bundle.totalPrice).toBe(49.9);
    expect(bundle.isActive).toBe(true);

    const items = await bundles.listItems(bundle.id);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.sortOrder)).toEqual([0, 1]);
  });

  it('kalemler TEK sorguda gelir (N+1 yok) ve mutabakat motorla doğrulanır', async () => {
    const withItems = await bundles.listWithItems();
    const row = withItems.find((b) => bundleIds.includes(b.id));
    expect(row?.items.length).toBeGreaterThan(0);

    const lines = (row?.items ?? []).map((i) => ({ qty: i.qty, allocatedUnitPriceCents: toCents(i.allocatedUnitPrice) }));
    const balance = bundleBalance(lines, toCents(row!.totalPrice));
    expect(balance.balanced).toBe(true);
  });

  it('aynı varyant iki kez eklenemez — hata OKUNABİLİR', async () => {
    const bundle = await createBundle(`Çift kalem ${stamp}`, 20, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 20 }]);
    await expect(
      bundles.syncItems(bundle.id, [
        { variantId: variantA, qty: 1, allocatedUnitPrice: 10 },
        { variantId: variantA, qty: 1, allocatedUnitPrice: 10 },
      ]),
    ).rejects.toThrow(/iki kez eklenemez/);
  });

  it('hediye kalem (0 fiyat) kaydedilebilir ve toplamı bozmaz', async () => {
    const bundle = await createBundle(`Hediyeli ${stamp}`, 30, [
      { variantId: variantA, qty: 1, allocatedUnitPrice: 30 },
      { variantId: variantB, qty: 1, allocatedUnitPrice: 0 },
    ]);
    const items = await bundles.listItems(bundle.id);
    expect(items.find((i) => i.variantId === variantB)?.allocatedUnitPrice).toBe(0);

    const lines = items.map((i) => ({ qty: i.qty, allocatedUnitPriceCents: toCents(i.allocatedUnitPrice) }));
    expect(bundleBalance(lines, toCents(bundle.totalPrice)).balanced).toBe(true);
  });

  it('senkron: listeden çıkan kalem silinir, sıra yeniden yazılır', async () => {
    const bundle = await createBundle(`Sıra ${stamp}`, 40, [
      { variantId: variantA, qty: 1, allocatedUnitPrice: 20 },
      { variantId: variantB, qty: 1, allocatedUnitPrice: 20 },
    ]);
    const before = await bundles.listItems(bundle.id);

    // B'yi başa al, A'yı çıkar.
    const after = await bundles.syncItems(bundle.id, [{ id: before[1]!.id, variantId: variantB, qty: 2, allocatedUnitPrice: 20 }]);
    expect(after).toHaveLength(1);
    expect(after[0]?.qty).toBe(2);
    expect(after[0]?.sortOrder).toBe(0);
    expect(await bundles.listItems(bundle.id)).toHaveLength(1);
  });

  it('pasif paket vitrin listesinde YOK, operasyon listesinde VAR', async () => {
    const bundle = await createBundle(`Pasif ${stamp}`, 15, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 15 }]);
    await bundles.setActive(bundle.id, false);

    expect((await bundles.listSellable()).some((b) => b.id === bundle.id)).toBe(false);
    expect((await bundles.listAll()).some((b) => b.id === bundle.id)).toBe(true);
  });

  it('ÜRÜNÜ pasife alınan paket vitrinden düşer ama niyeti (is_active) korunur', async () => {
    // Paket ancak tüm kalemleri satılabilirse satılabilir. `is_active`'i sistemin çevirmesi yerine
    // satılabilirliği TÜRETİYORUZ: ürün geri açıldığında paket kendiliğinden döner — aksi hâlde
    // pasifte kalır ve geri açılması gerektiğini kimse bilmez.
    const bundle = await createBundle(`Pasif ürün ${stamp}`, 20, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 20 }]);
    expect((await bundles.listSellable()).some((b) => b.id === bundle.id)).toBe(true);

    await products.update({ id: productId, status: 'passive' });
    const inactive = await bundles.listSellable();
    expect(inactive.some((b) => b.id === bundle.id)).toBe(false);
    expect((await bundles.getById(bundle.id))!.isActive).toBe(true); // niyet bozulmadı

    await products.update({ id: productId, status: 'active' });
    expect((await bundles.listSellable()).some((b) => b.id === bundle.id)).toBe(true); // kendiliğinden döndü
  });

  it('BOYU pasife alınan kalem de paketi düşürür', async () => {
    const bundle = await createBundle(`Pasif boy ${stamp}`, 15, [{ variantId: variantB, qty: 1, allocatedUnitPrice: 15 }]);
    await db.from('product_variant').update({ is_active: false }).eq('id', variantB);
    expect((await bundles.listSellable()).some((b) => b.id === bundle.id)).toBe(false);

    await db.from('product_variant').update({ is_active: true }).eq('id', variantB);
    expect((await bundles.listSellable()).some((b) => b.id === bundle.id)).toBe(true);
  });

  it('LİSTE satırı kalemleri değil ÖZETİ döndürür — fiyat/maliyet yoksa toplam YARIM sayılmaz', async () => {
    const bundle = await createBundle(`Özet ${stamp}`, 30, [
      { variantId: variantA, qty: 2, allocatedUnitPrice: 10 },
      { variantId: variantB, qty: 1, allocatedUnitPrice: 10 },
    ]);
    const row = (await bundles.listRows()).find((r) => r.id === bundle.id);

    expect(row).toBeDefined();
    expect(row!.itemCount).toBe(2);
    expect(row!.allocatedTotal).toBeCloseTo(30, 2);
    expect(row!.variantIds).toHaveLength(2);
    expect(row!.itemNames).toHaveLength(2); // ad çözümü uygulamada; ham jsonb burada
    // Fiyatı/maliyeti girilmemiş kalem varsa toplam EKSİKTİR: sayı eksik sayısıyla birlikte döner ki
    // ekran yarım toplamı tam sanmasın.
    expect(row!.missingPriceCount).toBe(2);
    expect(row!.missingCostCount).toBe(2);
  });

  it('fiyat ve parti girilince toplamlar dolar; KDV KALEM KALEM iner ve pasif ürün sayılır', async () => {
    const prices = new PriceService(db);
    const stocks = new StockService(db);
    const bundle = await createBundle(`Dolu özet ${stamp}`, 21.1, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 21.1 }]);

    await prices.setPrice({ variantId: variantA, channel: 'b2c', amountCents: 2500, validFrom: new Date(Date.now() - 86_400_000).toISOString() });
    // İki parti: 10 adet × 4 € + 30 adet × 8 € → ağırlıklı ortalama 7 €.
    const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await stocks.insert({ variantId: variantA, warehouseId, physicalQty: 10, purchasePriceCents: 400, expiryDate: dayOffset(100) });
    await stocks.insert({ variantId: variantA, warehouseId, physicalQty: 30, purchasePriceCents: 800, expiryDate: dayOffset(120) });

    const row = (await bundles.listRows()).find((r) => r.id === bundle.id)!;
    expect(row.listTotal).toBeCloseTo(25, 2); // "ayrı ayrı alınsa"
    expect(row.costTotal).toBeCloseTo(7, 2);
    expect(row.missingPriceCount).toBe(0);
    expect(row.missingCostCount).toBe(0);
    // Ürünün KDV oranı %5,5 (varsayılan): 21,10 / 1,055 = 20,00 — paketin tek oranı yoktur, kalemin
    // kendi oranıyla inilir.
    expect(row.revenueHt).toBeCloseTo(20, 2);

    // Ürünü satıştan çıkarınca kalem "engelli" sayılır — paket vitrine çıkamaz demektir.
    await products.update({ id: productId, status: 'passive' });
    expect((await bundles.listRows()).find((r) => r.id === bundle.id)!.blockedItemCount).toBe(1);
    await products.update({ id: productId, status: 'active' });

    await db.from('stock').delete().eq('variant_id', variantA);
  });

  it('slug ile bulunur (paylaşılan link) ve ad çok dilli döner', async () => {
    const bundle = await createBundle(`Paylaşım ${stamp}`, 12, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 12 }]);
    const found = await bundles.findBySlug(bundle.slug);
    expect(found?.id).toBe(bundle.id);
    expect(resolveLocalizedText(found!.name)).toContain('Paylaşım');
  });

  it('kürasyon sırası sürüklenebilir', async () => {
    const a = await createBundle(`Sıra A ${stamp}`, 10, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 10 }]);
    const b = await createBundle(`Sıra B ${stamp}`, 10, [{ variantId: variantB, qty: 1, allocatedUnitPrice: 10 }]);

    await bundles.reorder([b.id, a.id]);
    const sıralı = (await bundles.listAll()).filter((x) => x.id === a.id || x.id === b.id);
    expect(sıralı.map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('pakette kullanılan varyant SİLİNEMEZ — paket sessizce boşalmaz', async () => {
    const bundle = await createBundle(`Kilit ${stamp}`, 10, [{ variantId: variantA, qty: 1, allocatedUnitPrice: 10 }]);
    expect(bundle.id).toBeTruthy();
    // Varyantı silmeye kalkışmak `restrict` ile reddedilir; ürün silme de cascade orada durur.
    await expect(products.delete(productId)).rejects.toThrow();
  });
});
