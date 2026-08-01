import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse } from '@lezzet/database/testing';
import { toCents } from '@lezzet/helper';
import { repriceAllAuto, repriceProduct, repriceVariants } from './auto-price';

/**
 * Otomatik fiyatın KABLOSU (09.5). Motorun hesabı ayrı test edildi (`domain-core/auto-price`);
 * burada sınanan, o hesabın doğru satırlara ve YALNIZ onlara uygulanması:
 * otomatik olmayan ürüne dokunulmaması, kapalı kanalın açılmaması, değişmemiş fiyatın
 * geçmişi kopyalarla şişirmemesi.
 */
const db = serviceDb();
const prices = new PriceService(db);
const stamp = Date.now();

let categoryId: string;
// Depo geçişi (DOMAIN §17): parti/sipariş/kabul deposuz yazılamaz — testin kendi deposu.
let warehouseId: string;
let autoProductId: string;
let autoVariantId: string;
let manualProductId: string;
let manualVariantId: string;

/** Varyantın o kanaldaki güncel fiyatı (kuruş) — geçmişin en yenisi. */
async function currentCents(variantId: string, channel: 'b2c' | 'b2b'): Promise<number | null> {
  const row = await prices.findChannelPrice(variantId, channel);
  return row ? toCents(row.amount) : null;
}

async function priceRowCount(variantId: string): Promise<number> {
  return (await prices.listByVariant(variantId)).length;
}

/**
 * Alış geçmişini kurar — **en eskiden en yeniye** verilir, taban sonuncusudur (yenileme maliyeti).
 * Tek fiyat verilirse karşılaştıracak geçmiş yoktur ve fren devreye girmez.
 */
async function setCostHistory(variantId: string, ...purchasePrices: number[]) {
  await db.from('stock').delete().eq('variant_id', variantId);
  const stocks = new StockService(db);
  for (const purchasePrice of purchasePrices) {
    await stocks.insert({
      warehouseId,
      variantId,
      physicalQty: 10,
      purchasePrice,
      expiryDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    });
  }
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Otomatik fiyat ${stamp}` } })).id;
  const products = new ProductService(db);

  const auto = await products.create({
    name: { tr: `Otomatik ürün ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' } }],
  });
  autoProductId = auto.product.id;
  autoVariantId = auto.variants[0]!.id;
  await products.updateDetails(autoProductId, { autoPrice: true, targetMarginPercent: 40 });

  const manual = await products.create({
    name: { tr: `Elle ürün ${stamp}` },
    categoryId,
    vatRate: 5.5,
    variants: [{ label: { tr: '1 kg' } }],
  });
  manualProductId = manual.product.id;
  manualVariantId = manual.variants[0]!.id;
});

beforeEach(async () => {
  for (const id of [autoVariantId, manualVariantId]) {
    await db.from('price').delete().eq('variant_id', id);
    await db.from('stock').delete().eq('variant_id', id);
  }
});

afterAll(async () => {
  for (const id of [autoVariantId, manualVariantId]) {
    await db.from('price').delete().eq('variant_id', id);
    await db.from('stock').delete().eq('variant_id', id);
  }
  await purgeTestData(db, { productIds: [autoProductId, manualProductId], categoryIds: [categoryId] });
  await db.from('warehouse').delete().eq('id', warehouseId);
});

describe('hedefe çekme', () => {
  it('otomatik üründe iki kanal da hedef marja gelir', async () => {
    await setCostHistory(autoVariantId, 10);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2c', amount: 12, customerId: null });
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });

    const outcome = await repriceVariants(db, [autoVariantId]);

    expect(outcome.changes).toHaveLength(2);
    // 10 € maliyet, %40 hedef → 14 € HT; b2c'ye %5,5 KDV eklenir ve 5 kuruşa yukarı yuvarlanır.
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1400);
    expect(await currentCents(autoVariantId, 'b2c')).toBe(1480);
  });

  it('maliyet ARTINCA fiyat yükselir, DÜŞÜNCE iner — otomatik iki yönlüdür', async () => {
    await setCostHistory(autoVariantId, 10);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1400);

    // Kademeli artış: son alış 20, ortanca 19 → %5 sapma, fren devreye girmez.
    await setCostHistory(autoVariantId, 18, 19, 20);
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(2800);

    // Kademeli düşüş de aynı yoldan geçer.
    await setCostHistory(autoVariantId, 6, 5, 5);
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(700);
  });

  it('MALİYET SIÇRARSA fiyat oynamaz — karar admin\'e bırakılır', async () => {
    // Geçmiş 2,10 civarında oturmuş, son alış 4,50 (yereldeki gerçek sıçrama).
    await setCostHistory(autoVariantId, 210, 210, 450);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 300, customerId: null });

    const outcome = await repriceVariants(db, [autoVariantId]);

    expect(outcome.changes).toHaveLength(0);
    expect(outcome.heldVariantIds).toEqual([autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(30000);
  });

  it('ürün kimliğinden de çalışır (fiyat diyaloğunun yolu)', async () => {
    await setCostHistory(autoVariantId, 10);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });

    expect((await repriceProduct(db, autoProductId)).changes).toHaveLength(1);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1400);
  });

  it('katalog geneli hizalama otomatik ürünü bulur', async () => {
    await setCostHistory(autoVariantId, 10);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });

    const { changes, truncated } = await repriceAllAuto(db);

    expect(truncated).toBe(false);
    expect(changes.some((c) => c.variantId === autoVariantId)).toBe(true);
  });
});

describe('dokunulmayanlar', () => {
  it('otomatik OLMAYAN ürünün fiyatı sabit kalır', async () => {
    await setCostHistory(manualVariantId, 10);
    await prices.setPrice({ variantId: manualVariantId, channel: 'b2b', amount: 12, customerId: null });

    expect((await repriceVariants(db, [manualVariantId])).changes).toHaveLength(0);
    expect(await currentCents(manualVariantId, 'b2b')).toBe(1200);
  });

  it('fiyatı olmayan kanal AÇILMAZ — satışa kapalı kanal kendiliğinden açılamaz', async () => {
    await setCostHistory(autoVariantId, 10);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });

    await repriceVariants(db, [autoVariantId]);

    expect(await currentCents(autoVariantId, 'b2c')).toBeNull();
  });

  it('maliyet yoksa fiyat UYDURULMAZ', async () => {
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });

    expect((await repriceVariants(db, [autoVariantId])).changes).toHaveLength(0);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1200);
  });

  it('fiyat zaten hedefteyse YENİ SATIR yazılmaz — geçmiş kopyayla şişmez', async () => {
    await setCostHistory(autoVariantId, 10);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amount: 12, customerId: null });
    await repriceVariants(db, [autoVariantId]);
    const after = await priceRowCount(autoVariantId);

    expect((await repriceVariants(db, [autoVariantId])).changes).toHaveLength(0);
    expect(await priceRowCount(autoVariantId)).toBe(after);
  });
});
