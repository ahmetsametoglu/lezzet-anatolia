import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BundleService, CategoryService, ProductService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { toCents } from '@lezzet/helper';
// Testin beklediği şekil ELLE YAZILMAZ, sözleşmeden gelir (`home.test.ts` emsali).
import { PackageDetailSchema, type PackageDetail } from '@lezzet/types';
import { app } from '../../app';

/**
 * Paket detay ucu uçtan uca — `app.request()` ile PORT AÇMADAN.
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): iddiaların hepsi bu dosyanın KENDİ kurduğu satırlara
 * bakar (damgalı adlar, slug üzerinden nokta atışı okuma); küresel sayım/karşılaştırma yok —
 * başka bir ajanın paketi hiçbir iddiayı oynatamaz.
 */
const stamp = Date.now();
const db = serviceDb();

const productIds: string[] = [];
const categoryIds: string[] = [];
/** Paketler purge kapsamında DEĞİL (`bundle.test.ts` teardown notu) — üründen önce elle gider. */
const bundleIds: string[] = [];

let sellableSlug = '';
let coldChainSlug = '';
let passiveSlug = '';

const tr3 = (tr: string, fr: string, de: string) => ({ tr, fr, de });

/** Zarfı açar; `error` doluysa iddia orada patlasın diye ayrıca kontrol edilir. */
async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: tr3(`VPKG Kat ${stamp}`, `VPKG Cat ${stamp}`, `VPKG Kat DE ${stamp}`) });
  categoryIds.push(category.id);

  const products = new ProductService(db);
  // Kargolanabilen, İKİ boylu ürün: kalem etiketi (unitLabel) boydan, ad üründen okunur.
  const shippableSeed = await products.create({
    name: tr3(`VPKG Baklava ${stamp}`, `VPKG Baklava FR ${stamp}`, `VPKG Baklava DE ${stamp}`),
    categoryId: category.id,
    status: 'active',
    shippable: true,
    variants: [
      { label: tr3('500 g', '500 g', '500 g'), netWeightG: 500, sortOrder: 0 },
      { label: tr3('1 kg', '1 kg', '1 kg'), netWeightG: 1000, sortOrder: 1 },
    ],
  });
  // Soğuk zincir ürünü: BİR kalemi bile kargolanamayan paket bütünüyle bölge-içine kilitlenir.
  const coldSeed = await products.create({
    name: tr3(`VPKG Dondurma ${stamp}`, `VPKG Glace ${stamp}`, `VPKG Eis ${stamp}`),
    categoryId: category.id,
    status: 'active',
    shippable: false,
    variants: [{ label: tr3('1 L', '1 L', '1 L'), netWeightG: 900, sortOrder: 0 }],
  });
  productIds.push(shippableSeed.product.id, coldSeed.product.id);
  const [half, kilo] = shippableSeed.variants;
  const cold = coldSeed.variants[0];
  if (!half || !kilo || !cold) throw new Error('kurulum boyları eksik doğdu');

  const bundles = new BundleService(db);
  // Tamamı kargolanabilen paket — sıra iddiası için kalemler bilinçli iki ayrı boydan.
  const sellable = await bundles.create({
    name: tr3(`VPKG Sofra ${stamp}`, `VPKG Table ${stamp}`, `VPKG Tafel ${stamp}`),
    description: tr3('Üç klasik bir kutuda.', 'Trois classiques.', 'Drei Klassiker.'),
    totalPrice: 49.9,
    items: [
      { variantId: half.id, qty: 2, allocatedUnitPrice: 10 },
      { variantId: kilo.id, qty: 1, allocatedUnitPrice: 29.9 },
    ],
  });
  sellableSlug = sellable.bundle.slug;

  const coldBundle = await bundles.create({
    name: tr3(`VPKG Soguk ${stamp}`, `VPKG Froid ${stamp}`, `VPKG Kalt ${stamp}`),
    totalPrice: 12,
    items: [{ variantId: cold.id, qty: 1, allocatedUnitPrice: 12 }],
  });
  coldChainSlug = coldBundle.bundle.slug;

  // Pasif paket: operatör satıştan çekti — doğrudan linkle de açılMAmalı (DOMAIN §13 sınıfı).
  const passive = await bundles.create({
    name: tr3(`VPKG Pasif ${stamp}`, `VPKG Passif ${stamp}`, `VPKG Passiv ${stamp}`),
    totalPrice: 9,
    isActive: false,
    items: [{ variantId: half.id, qty: 1, allocatedUnitPrice: 9 }],
  });
  passiveSlug = passive.bundle.slug;

  bundleIds.push(sellable.bundle.id, coldBundle.bundle.id, passive.bundle.id);
});

afterAll(async () => {
  // Paketler ÜRÜNDEN ÖNCE gider: kalemler varyanta `restrict` ile bağlı, ürün silme cascade'i
  // orada reddedilirdi. Ortak `purgeTestData` ürün grafiğini toplar; paket onun kapsamında değil
  // (`bundle.test.ts` teardown'unun aynı sırası — purge'e `bundleIds` hedefi rapor edildi).
  const bundles = new BundleService(db);
  for (const id of bundleIds) await bundles.delete(id);
  await purgeTestData(db, { productIds, categoryIds });
});

describe('GET /api/v1/packages/:slug', () => {
  it('oturumsuz 200; gövde SÖZLEŞMENİN kendisiyle doğrulanır ve kalemler ürün adına/boyuna bağlanır', async () => {
    const res = await app.request(`/api/v1/packages/${sellableSlug}?locale=fr`);
    expect(res.status).toBe(200);
    const data = await dataOf<PackageDetail>(res);
    expect(() => PackageDetailSchema.parse(data)).not.toThrow();

    expect(data.name).toBe(`VPKG Table ${stamp}`);
    expect(data.description).toBe('Trois classiques.');
    // Tek fiyat, ham cent — `toCents(totalPrice)`; kalem fiyatı hiçbir satırda YOK (tek fiyat kuralı).
    expect(data.priceCents).toBe(toCents(49.9));
    expect(data.shippable).toBe(true);

    // Kalemler paketin KENDİ sırasında; ad üründen, etiket boydan, adet kalemden.
    expect(data.items.map((i) => [i.name, i.unitLabel, i.qty])).toEqual([
      [`VPKG Baklava FR ${stamp}`, '500 g', 2],
      [`VPKG Baklava FR ${stamp}`, '1 kg', 1],
    ]);
    // Satır ürün DETAYINA açılır — slug ürünün slug'ıdır, paketinki değil.
    for (const item of data.items) expect(item.slug).not.toBe(sellableSlug);
  });

  it('kargolanamayan BİR kalem paketi bölge-içine kilitler (`shippable: false`)', async () => {
    const data = await dataOf<PackageDetail>(await app.request(`/api/v1/packages/${coldChainSlug}?locale=tr`));
    expect(data.shippable).toBe(false);
  });

  it('locale yoksa 400 invalid_locale — sessizce TRye düşülmez', async () => {
    const res = await app.request(`/api/v1/packages/${sellableSlug}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_locale' });
  });

  it('bilinmeyen slug 404 package_not_found', async () => {
    const res = await app.request(`/api/v1/packages/vpkg-olmayan-${stamp}?locale=tr`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'package_not_found' });
  });

  it('pasif paket doğrudan linkle de açılmaz — 404 (operatörün niyeti kapıdır)', async () => {
    const res = await app.request(`/api/v1/packages/${passiveSlug}?locale=tr`);
    expect(res.status).toBe(404);
  });

  it('bozuk Bearer paketi KAPATMAZ — ziyaretçi olarak 200 (katalogla aynı karar)', async () => {
    const res = await app.request(`/api/v1/packages/${sellableSlug}?locale=de`, {
      headers: { authorization: 'Bearer bu-bir-token-degil' },
    });
    expect(res.status).toBe(200);
  });
});
