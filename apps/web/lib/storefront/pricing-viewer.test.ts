import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, StockService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { getCartView } from '@/lib/cart/read';

/**
 * **Fiyatın "kim soruyor" ekseni** (DOMAIN §5, §10) — `read-viewer.ts`'in bağladığı iki açık.
 *
 * Vitrin fiyatı uzun süre `channel: 'b2c'` ve `b2bApproved: false` SABİTLERİYLE çözülüyordu.
 * Hiçbir şey patlamıyordu, çünkü sabitler geçerli değerlerdi — yalnız iki özellik sessizce ölüydü:
 * onaylanmış B2B müşteri toptan fiyat görmüyordu ve müşteriye özel fiyat hiç okunmuyordu. Bu
 * sınıf hatanın testi de bu yüzden yazılıyor: kod okunarak değil, **fiyatın kendisi sorularak**
 * doğrulanır.
 *
 * Sınama `getCartView` üzerinden çünkü zincirin tamamını geçiyor: kimlik → görüntüleyen künyesi →
 * fiyat satırlarının okunması → motor. Ara katmandan biri sabitlense test yine kırmızıya döner.
 */
const db = serviceDb();
const stamp = Date.now();

let categoryId: string;
let productId: string;
let variantId: string;
let warehouseId: string;
const createdProfiles: string[] = [];

const B2C_FIYAT = 3_000;
/** Toptan liste — B2C'den belirgin farklı ki "hangisini gördü" sorusu tek bakışta cevaplansın. */
const B2B_FIYAT = 1_800;
/** Anlaşmalı fiyat: kanal listesinden de ucuz — motorun sırası "özel → kanal". */
const OZEL_FIYAT = 1_500;

/** Damgalı müşteri; `company` + onay durumu çağırana bırakılır (CLAUDE §4b: küresel satır kirletilmez). */
async function newCustomer(opts: { company?: boolean; approved?: boolean | null } = {}): Promise<string> {
  const profiles = new UserProfileService(db);
  const profile = await profiles.insert({
    roles: ['customer'],
    type: opts.company ? 'company' : 'individual',
    name: `Fiyat ${stamp}`,
    email: `fiyat-${stamp}-${createdProfiles.length + 1}@example.test`,
    ...(opts.company ? { companyInfo: { legalName: `Test SARL ${stamp}` } } : {}),
  });
  createdProfiles.push(profile.id);
  if (opts.approved !== undefined) await profiles.update({ id: profile.id, b2bApproved: opts.approved });
  return profile.id;
}

const entry = () => [{ kind: 'variant' as const, variantId, qty: 1, stockId: null }];

/** Sepetteki tek satırın birim fiyatı — testin sorduğu tek sayı. */
async function birimFiyat(customerId?: string): Promise<number | null> {
  const view = await getCartView('tr', entry(), { warehouseId, ...(customerId ? { customerId } : {}) });
  return view.lines[0]?.unitPriceCents ?? null;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Görüntüleyen ${stamp}` } })).id;
  const created = await new ProductService(db).create({
    name: { tr: `Görüntüleyen ürünü ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }],
  });
  productId = created.product.id;
  variantId = created.variants[0]!.id;

  const prices = new PriceService(db);
  await prices.setPrice({ variantId, channel: 'b2c', amountCents: B2C_FIYAT });
  await prices.setPrice({ variantId, channel: 'b2b', amountCents: B2B_FIYAT });

  // Stok ŞART: stoksuz satır "tükendi" işaretlenir ve fiyat sorusu hiç sorulmaz.
  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 50,
    expiryDate: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
  });
});

afterAll(async () => {
  await db.from('stock').delete().eq('variant_id', variantId);
  await purgeTestData(db, {
    productIds: [productId],
    categoryIds: [categoryId],
    profileIds: createdProfiles,
    warehouseIds: [warehouseId],
  });
});

describe('fiyatın görüntüleyen ekseni', () => {
  it('ziyaretçi perakende fiyat görür', async () => {
    expect(await birimFiyat()).toBe(B2C_FIYAT);
  });

  it('ONAYLI B2B müşteri toptan fiyat görür', async () => {
    // Zincirin karşılıksız kalan son adımı buydu: başvuru → kontrol kartı → onay → "toptan fiyat
    // açılır". Onay veriliyordu, fiyat açılmıyordu.
    const customerId = await newCustomer({ company: true, approved: true });
    expect(await birimFiyat(customerId)).toBe(B2B_FIYAT);
  });

  it('ONAYSIZ şirket perakende fiyat görür — toptan liste doğrulanmamış kayda açılmaz', async () => {
    // DOMAIN §10 ve asıl riskli dal bu: SIRET herkese açıktır, şirket künyesi girmek toptancı
    // olmak değildir. Burası gevşerse form dolduran herkes toptan fiyattan alışveriş yapar.
    const customerId = await newCustomer({ company: true, approved: false });
    expect(await birimFiyat(customerId)).toBe(B2C_FIYAT);
  });

  it('HİÇ BAŞVURMAMIŞ şirket de perakende görür — `null` onay DEĞİLDİR', async () => {
    // `b2b_approved` üç değerli ve `null` "hiç sorulmadı" demek. `!== false` gibi bir kontrol
    // yazılsaydı bu satır sessizce toptan fiyat açardı (CLAUDE §1: ölçülemeyen değer sıfır değildir).
    const customerId = await newCustomer({ company: true, approved: null });
    expect(await birimFiyat(customerId)).toBe(B2C_FIYAT);
  });

  it('müşteriye ÖZEL fiyat kanal listesini yener', async () => {
    // İkinci sessiz açık: kimlik verilmeyince `findApplicableMap` özel fiyat satırlarını hiç
    // sorgulamıyordu, yani `price.customer_id` kolonu ve onu yazan operasyon ekranı vardı ama
    // vitrinde hiçbir karşılığı yoktu.
    const customerId = await newCustomer({ company: true, approved: true });
    await new PriceService(db).setPrice({ variantId, channel: 'b2b', customerId, amountCents: OZEL_FIYAT });
    expect(await birimFiyat(customerId)).toBe(OZEL_FIYAT);
  });
});
