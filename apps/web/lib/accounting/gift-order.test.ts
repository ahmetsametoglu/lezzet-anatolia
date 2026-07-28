import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccountService, CategoryService, OrderService, ProductService, StockService, UserProfileService, serviceDb,
} from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { quickSale } from '../order/quick-sale';
import { buildExport } from './export';

/**
 * **Patron ikramı — DOMAIN §9.** Patron bir arkadaşına siparişi hediye eder; müşteri ödemez ama
 * **parayı patron kendisi öder**. Yani gerçek bir satıştır: mal depodan çıkar, maliyeti kâra biner,
 * para kasaya girer.
 *
 * `isGiftOrder` YALNIZCA muhasebe export'unu etkiler. Bu dosya o kuralı **kilitler**: birileri bir
 * gün "hediye siparişi stoktan/cirodan/kârdan düşelim" derse test kırmızıya döner. Kural yorumda
 * yazılı olmakla korunmaz, ancak ölçülürse korunur.
 */
const db = serviceDb();
const orders = new OrderService(db);
const stocks = new StockService(db);
const accounts = new AccountService(db);

const damga = Date.now();
let customerId: string;
let variantId: string;
let productId: string;
let categoryId: string;
let kasa: string;
const acilanProfiller: string[] = [];

const gun = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const ADET = 3;
const BIRIM_FIYAT = 12;
const ALIS = 4;
const TOPLAM = ADET * BIRIM_FIYAT; // 36 €

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `İkram testi ${damga}` } });
  const { product, variants } = await new ProductService(db).create({ name: { tr: `Künefe ${damga}` }, categoryId: category.id });
  categoryId = category.id;
  productId = product.id;
  variantId = variants[0]!.id;
  customerId = (await new UserProfileService(db).insert({ name: `İkram edilen ${damga}` })).id;
  acilanProfiller.push(customerId);
  kasa = (await accounts.insert({ name: `İkram kasası ${damga}`, type: 'cash' })).id;
});

afterAll(async () => {
  await db.from('money_movement').delete().eq('account_id', kasa);
  await db.from('order').delete().eq('customer_id', customerId);
  await db.from('stock').delete().eq('variant_id', variantId);
  await db.from('account').delete().eq('id', kasa);
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], profileIds: acilanProfiller });
});

describe('patron ikramı iç hesapların TAMAMINDA sayılır', () => {
  it('mal stoktan düşer, maliyet kâra biner, para kasaya girer — yalnız export dışıdır', async () => {
    const parti = await stocks.insert({ variantId, physicalQty: 10, expiryDate: gun(200), purchasePrice: ALIS });
    const kasaOnce = (await accounts.balance(kasa)).balance;
    // Export'un ikram öncesi hâli: karşılaştırma FARK üzerinden yapılır (rapor şirket genelini okur).
    const exportOnce = await buildExport({ from: gun(0), to: gun(0) });

    const { order } = await orders.create(
      { customerId, channel: 'b2c', orderSource: 'door', isGiftOrder: true, total: TOPLAM },
      [{ variantId, qty: ADET, unitPrice: BIRIM_FIYAT, vatRate: 5.5 }],
    );

    const sonuc = await quickSale({ orderId: order.id, paymentMethod: 'cash', paymentAccountId: kasa });
    expect(sonuc.status).toBe('ok');
    if (sonuc.status !== 'ok') return;

    // 1) STOK: mal gerçekten gitti — ikram, malı depoda bırakmaz.
    expect((await stocks.getById(parti.id))?.physicalQty).toBe(10 - ADET);
    expect(sonuc.consumedQty).toBe(ADET);

    // 2) KÂR: maliyet kapanışta sabitlendi — ikramın maliyeti kârda görünür.
    expect(sonuc.cogsAmount).toBe(ADET * ALIS);
    expect((await orders.getById(order.id))?.cogsAmount).toBe(ADET * ALIS);

    // 3) KASA: parayı patron ödedi, hesabın bakiyesine girdi.
    expect(sonuc.paymentRecorded).toBe(true);
    expect((await accounts.balance(kasa)).balance).toBe(kasaOnce + TOPLAM);
    expect(await orders.getById(order.id)).toMatchObject({ amountCollected: TOPLAM, paymentStatus: 'paid' });

    // 4) EXPORT: TEK fark burada — satır dosyaya girmez, ama tutarı özet'te açıkça durur.
    const exportSonra = await buildExport({ from: gun(0), to: gun(0) });
    expect(exportSonra.rows.map((r) => r.orderId)).not.toContain(order.id);
    expect(exportSonra.rows).toHaveLength(exportOnce.rows.length);
    expect(exportSonra.summary.excludedGiftCount - exportOnce.summary.excludedGiftCount).toBe(1);
    expect(exportSonra.summary.excludedGiftGross - exportOnce.summary.excludedGiftGross).toBe(TOPLAM);
  });
});
