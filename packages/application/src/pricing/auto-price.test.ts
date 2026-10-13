import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, ProductVatRateService, StockService, serviceDb } from '@lezzet/database';
import { purgeTestData, createTestWarehouse, mustDelete, purgeVariantStock, settingsSnapshot } from '@lezzet/database/testing';
import { AUTO_PRICE_STEP_KEY, DISTANCE_SALE_SETTINGS } from '@lezzet/domain-core';
import { parisDateOf } from '@lezzet/helper';
import { repriceAllAuto, repriceProduct, repriceVariants } from './auto-price';

/**
 * Otomatik fiyatın kablosu: motorun hesabı `domain-core/auto-price`ta sınanır, burada o hesabın doğru satırlara ve yalnız onlara
 * uygulanması (otomatik olmayan ürün, kapalı kanal, değişmeyen fiyatın geçmişi, Almanya satırı) ve adımın ayardan okunması sınanır.
 */
const db = serviceDb();
const prices = new PriceService(db);
const settings = settingsSnapshot(db);
const stamp = Date.now();

let categoryId: string;
// Parti deposuz yazılamaz; testin kendi deposu.
let warehouseId: string;
let autoProductId: string;
let autoVariantId: string;
let manualProductId: string;
let manualVariantId: string;

/** Varyantın o kanaldaki güncel fiyatı (kuruş) — geçmişin en yenisi. */
async function currentCents(variantId: string, channel: 'b2c' | 'b2b'): Promise<number | null> {
  const row = await prices.findChannelPrice(variantId, channel);
  return row?.amountCents ?? null;
}

async function priceRowCount(variantId: string): Promise<number> {
  return (await prices.listByVariant(variantId)).length;
}

/**
 * Alış geçmişini kurar; fiyatlar en eskiden en yeniye verilir, taban sonuncusudur (yenileme maliyeti). Tek fiyat verilirse
 * karşılaştıracak geçmiş yoktur ve fren devreye girmez.
 */
async function setCostHistory(variantId: string, ...purchasePricesCents: number[]) {
  await purgeVariantStock(db, [variantId]);
  const stocks = new StockService(db);
  for (const purchasePriceCents of purchasePricesCents) {
    await stocks.insert({
      warehouseId,
      variantId,
      physicalQty: 10,
      purchasePriceCents,
      expiryDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
    });
  }
}

beforeAll(async () => {
  // Adım fabrika değerine sabitlenir: beklenen fiyatlar 50 sentlik adımla yazıldı, ayar sonunda okunan değere geri konur.
  await settings.override(AUTO_PRICE_STEP_KEY, 50);
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
  await mustDelete(db, 'price', (q) => q.in('variant_id', [autoVariantId, manualVariantId]));
  await purgeVariantStock(db, [autoVariantId, manualVariantId]);
});

afterAll(async () => {
  await settings.restore();
  await mustDelete(db, 'price', (q) => q.in('variant_id', [autoVariantId, manualVariantId]));
  await purgeVariantStock(db, [autoVariantId, manualVariantId]);
  await purgeTestData(db, { productIds: [autoProductId, manualProductId], categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

describe('hedefe çekme', () => {
  it('otomatik üründe iki kanal da hedef marja gelir', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2c', amountCents: 1200, customerId: null });
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

    const outcome = await repriceVariants(db, [autoVariantId]);

    expect(outcome.changes).toHaveLength(2);
    // 10 € maliyet, %40 hedef → 14 € HT; b2c'ye %5,5 KDV eklenir (14,77) ve 50 sente yukarı yuvarlanır.
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1400);
    expect(await currentCents(autoVariantId, 'b2c')).toBe(1500);
  });

  it('yuvarlama adımı ayardan okunur ve yalnız tüketici fiyatına uygulanır', async () => {
    // 10,20 € maliyet, %40 hedef → 14,28 € HT; tüketicide %5,5 KDV'yle 15,07 → 50 sentlik adımda 15,50, tam euroda 16,00.
    // İşletme fiyatı adımdan bağımsız 14,28 € kalır, çünkü işletme nakit ödemez.
    await setCostHistory(autoVariantId, 1020);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2c', amountCents: 1200, customerId: null });
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2c')).toBe(1550);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1428);

    await settings.override(AUTO_PRICE_STEP_KEY, 100);
    try {
      await repriceVariants(db, [autoVariantId]);
      expect(await currentCents(autoVariantId, 'b2c')).toBe(1600);
      expect(await currentCents(autoVariantId, 'b2b')).toBe(1428);
    } finally {
      await settings.override(AUTO_PRICE_STEP_KEY, 50);
    }
  });

  it('maliyet ARTINCA fiyat yükselir, DÜŞÜNCE iner — otomatik iki yönlüdür', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1400);

    // Kademeli artış: son alış 20 €, ortanca 19 € → %5 sapma, fren devreye girmez.
    await setCostHistory(autoVariantId, 1800, 1900, 2000);
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(2800);

    // Kademeli düşüş de aynı yoldan geçer.
    await setCostHistory(autoVariantId, 600, 500, 500);
    await repriceVariants(db, [autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(700);
  });

  it("MALİYET SIÇRARSA fiyat oynamaz — karar admin'e bırakılır", async () => {
    // Geçmiş 2,10 € civarında oturmuş, son alış 4,50 €.
    await setCostHistory(autoVariantId, 210, 210, 450);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 30000, customerId: null });

    const outcome = await repriceVariants(db, [autoVariantId]);

    expect(outcome.changes).toHaveLength(0);
    expect(outcome.heldVariantIds).toEqual([autoVariantId]);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(30000);
  });

  it('ürün kimliğinden de çalışır (fiyat diyaloğunun yolu)', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

    expect((await repriceProduct(db, autoProductId)).changes).toHaveLength(1);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1400);
  });

  /**
   * Bu test kataloğun tamamına yazar, çünkü `repriceAllAuto` işaretli her ürünü hedefe çeker; paylaşılan veritabanında fikstür dışındaki
   * yazım beslemenin fiyatı gibi okunurdu. Geri alma fonksiyonun döndüğü `changes` listesinden yürür.
   */
  it('katalog geneli hizalama otomatik ürünü bulur', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

    const startedAt = new Date().toISOString();
    const { changes, truncated } = await repriceAllAuto(db);

    // Fikstür dışındaki satır geri alınır; hizalama yeni satır yazdığı için ölçüt bu koşuda doğan satırdır (`created_at`).
    const foreign = [...new Set(changes.map((c) => c.variantId))].filter((id) => id !== autoVariantId);
    if (foreign.length > 0) {
      await mustDelete(db, 'price', (q) => q.in('variant_id', foreign).gte('created_at', startedAt));
    }

    expect(truncated).toBe(false);
    expect(changes.some((c) => c.variantId === autoVariantId)).toBe(true);
  });
});

describe('dokunulmayanlar', () => {
  it('otomatik OLMAYAN ürünün fiyatı sabit kalır', async () => {
    await setCostHistory(manualVariantId, 1000);
    await prices.setPrice({ variantId: manualVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

    expect((await repriceVariants(db, [manualVariantId])).changes).toHaveLength(0);
    expect(await currentCents(manualVariantId, 'b2b')).toBe(1200);
  });

  it('fiyatı olmayan kanal AÇILMAZ — satışa kapalı kanal kendiliğinden açılamaz', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

    await repriceVariants(db, [autoVariantId]);

    expect(await currentCents(autoVariantId, 'b2c')).toBeNull();
  });

  it('maliyet yoksa fiyat UYDURULMAZ', async () => {
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

    expect((await repriceVariants(db, [autoVariantId])).changes).toHaveLength(0);
    expect(await currentCents(autoVariantId, 'b2b')).toBe(1200);
  });

  it('fiyat zaten hedefteyse YENİ SATIR yazılmaz — geçmiş kopyayla şişmez', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });
    await repriceVariants(db, [autoVariantId]);
    const after = await priceRowCount(autoVariantId);

    expect((await repriceVariants(db, [autoVariantId])).changes).toHaveLength(0);
    expect(await priceRowCount(autoVariantId)).toBe(after);
  });
});

/** Eşik durumu ayarla kurulur: açılış tutarı eşiği aşınca varış ülkesi vergilendirmesi başlar, dev eşik onu kapatır. */
async function esikDurumu(asildi: boolean): Promise<void> {
  const yil = Number(parisDateOf(new Date()).slice(0, 4));
  await settings.override(DISTANCE_SALE_SETTINGS.thresholdCents.key, asildi ? 1_000_000 : 1_000_000_000_000);
  await settings.override(DISTANCE_SALE_SETTINGS.openingYear.key, yil);
  await settings.override(DISTANCE_SALE_SETTINGS.openingCents.key, asildi ? 2_000_000 : 0);
  await settings.override(DISTANCE_SALE_SETTINGS.openingPreviousCents.key, 0);
}

describe('Almanya tüketici fiyatı', () => {
  const almanya = async (channel: 'b2c' | 'b2b') => (await prices.findListPricesMap([autoVariantId], channel)).get(autoVariantId);

  it('eşik aşılmışken Alman oranıyla yazılır, eşik altında genel fiyata eşit olduğu için kalkar; işletme fiyatı satır almaz', async () => {
    const oranlar = new ProductVatRateService(db);
    await oranlar.set({ productId: autoProductId, country: 'DE', vatRate: 19 });
    try {
      await setCostHistory(autoVariantId, 1000);
      await prices.setPrice({ variantId: autoVariantId, channel: 'b2c', amountCents: 1200, customerId: null });
      await prices.setPrice({ variantId: autoVariantId, channel: 'b2b', amountCents: 1200, customerId: null });

      // 14 € HT: Fransa'da %5,5 ile 15,00 €, Almanya'da %19 ile 16,66 → 17,00 €.
      await esikDurumu(true);
      await repriceVariants(db, [autoVariantId]);
      expect(await almanya('b2c')).toMatchObject({ general: { amountCents: 1500 }, byCountry: { DE: { amountCents: 1700 } } });
      expect((await almanya('b2b'))?.byCountry).toEqual({});

      // Eşik altında Almanya'daki tüketici satıcının oranını öder; fiyat genel fiyata eşitlenir ve satır gereksizleşir.
      await esikDurumu(false);
      await repriceVariants(db, [autoVariantId]);
      expect((await almanya('b2c'))?.byCountry).toEqual({});
    } finally {
      await oranlar.remove(autoProductId, 'DE');
    }
  });

  it('Almanya oranı olmayan ürünün eski Almanya satırı kaldırılır — orada satılmayan ürünün fiyatı yoktur', async () => {
    await setCostHistory(autoVariantId, 1000);
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2c', amountCents: 1500, customerId: null });
    await prices.setPrice({ variantId: autoVariantId, channel: 'b2c', amountCents: 1900, customerId: null, country: 'DE' });

    await esikDurumu(true);
    const outcome = await repriceVariants(db, [autoVariantId]);

    expect((await almanya('b2c'))?.byCountry).toEqual({});
    expect(outcome.changes).toContainEqual({ variantId: autoVariantId, channel: 'b2c', country: 'DE', fromCents: 1900, toCents: null });
  });
});
