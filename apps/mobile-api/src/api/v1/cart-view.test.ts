import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIN_BASKET_KEY } from '@lezzet/application';
import {
  CategoryService,
  DeliveryZoneService,
  PriceService,
  ProductService,
  ProductVatRateService,
  SettingsService,
  StockService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, mustDelete, purgeTestData, testPostalCode } from '@lezzet/database/testing';
import { app } from '../../app';

/**
 * Misafirin sepet görünümü (`POST /api/v1/cart/view`, Bearer'sız): sepetin parası sunucunun kararıdır, gövde satırın yalnız adresini
 * ve adedini taşır, uç hiçbir şey yazmaz. Okuma kapısının `source` ve `place` alanları zarfa sızmaz, çünkü `ok()` gevşek tiplidir.
 */
const db = serviceDb();
const stamp = Date.now();

let warehouseId: string;
let categoryId: string;
let productId: string;
let variantId: string;

const BIRIM_FIYAT = 1250;
const ileriGun = (offset: number): string => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

/**
 * Misafir sepeti isteği; dil sorgu dizesinden gelir ve varsayılansızdır (`localeOf`), çünkü dilsiz okuma Fransız müşteriye Türkçe ürün
 * adı gönderirdi.
 */
function view(body: unknown, locale = 'tr') {
  return app.request(`/api/v1/cart/view?locale=${locale}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const satir = (over: Record<string, unknown> = {}) => ({ kind: 'variant', variantId, qty: 2, stockId: null, ...over });

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'MSF' })).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Misafir sepeti ${stamp}` } })).id;
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Misafir böreği ${stamp}` },
    categoryId,
    shelfLifeDays: 200,
    variants: [{ label: { tr: '500 g' } }],
  });
  productId = product.id;
  variantId = variants[0]!.id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: BIRIM_FIYAT });
  await new StockService(db).insert({
    warehouseId,
    variantId,
    physicalQty: 50,
    expiryDate: ileriGun(60),
    purchasePriceCents: 400,
  });
});

afterAll(async () => {
  await purgeTestData(db, { productIds: [productId], categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

describe('POST /api/v1/cart/view', () => {
  it('misafir sepetinin parasını SUNUCU hesaplar', async () => {
    const res = await view({ items: [satir()] });

    expect(res.status).toBe(200);
    const body = await dataOf<{ lines: { unitPriceCents: number | null }[] }>(res);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.unitPriceCents).toBe(BIRIM_FIYAT);
  });

  it('İSTEMCİNİN GÖNDERDİĞİ FİYAT yok sayılır — sepet müşterinin belirlediği tutardan kurulmaz', async () => {
    // Uydurulmuş bir tutar ne kabul edilir ne isteği düşürür: gövde şeması yalnız adres + adet
    // tanıyor, fazlası süzülüyor.
    const res = await view({ items: [satir({ unitPriceCents: 1, lineTotalCents: 1 })] });

    expect(res.status).toBe(200);
    const body = await dataOf<{ lines: { unitPriceCents: number | null }[] }>(res);
    expect(body.lines[0]?.unitPriceCents).toBe(BIRIM_FIYAT);
  });

  it('`source` ve `place` ZARFA SIZMAZ — okuma kapısı üçünü birden döndürüyor', async () => {
    // `ok()` gevşek tipli olduğu için okuma kapısının tamamını göndermek derlemede hata vermez; sızıntıyı bu iddia yakalar.
    const body = await dataOf<Record<string, unknown>>(await view({ items: [satir()] }));

    expect(body).not.toHaveProperty('source');
    expect(body).not.toHaveProperty('place');
    expect(body).not.toHaveProperty('warehouseId');
  });

  it('HİÇBİR ŞEY YAZMAZ — sunucuda sepet satırı doğmaz', async () => {
    const oncesi = await db.from('cart').select('id', { count: 'exact', head: true });
    await view({ items: [satir()] });
    const sonrasi = await db.from('cart').select('id', { count: 'exact', head: true });

    expect(sonrasi.count).toBe(oncesi.count);
  });

  it('BOŞ sepet geçerli bir istektir — hata değil', async () => {
    const res = await view({ items: [] });

    expect(res.status).toBe(200);
    expect((await dataOf<{ lines: unknown[] }>(res)).lines).toEqual([]);
  });

  it('BOZUK gövde 400 `invalid_body`', async () => {
    const res = await view({ items: [{ kind: 'variant', qty: 'iki' }] });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('invalid_body');
  });

  it('TANINMAYAN dil 400 `invalid_locale` — cevap dile bağlı, tahmin edilmez', async () => {
    const res = await view({ items: [satir()] }, 'zz');

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('invalid_locale');
  });

  it('olmayan varyant sepeti DÜŞÜRMEZ — kalan satırlar yine hesaplanır', async () => {
    // Cihazdaki sepet bayat olabilir (ürün silinmiş, varyant kapanmış). İsteği tümden reddetmek,
    // müşteriye sepetini hiç göstermemek olurdu.
    const res = await view({
      items: [satir(), satir({ variantId: '00000000-0000-4000-9000-000000000000' })],
    });

    expect(res.status).toBe(200);
    const body = await dataOf<{ lines: unknown[] }>(res);
    expect(body.lines.length).toBeGreaterThan(0);
  });
});

describe('POST /api/v1/cart/view — yerin kapsamı', () => {
  const kod = testPostalCode();
  const settings = new SettingsService(db);
  // Asgari sepet kapsamların en yükseğidir; bölgenin değeri öteki kapsamların hepsinden yüksek seçilir ki okunan değer ondan gelsin.
  const BOLGE_ASGARI = 987_600;
  const ALMANYA_FIYATI = 1390;
  let zoneId: string;
  let oransizUrunId: string;
  let oransizBoyId: string;

  const almanyaSepeti = (items: unknown[]) =>
    app.request(`/api/v1/cart/view?locale=tr&postalCode=${kod}&country=DE`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    });

  beforeAll(async () => {
    const zones = new DeliveryZoneService(db);
    zoneId = (await zones.insert({ name: `Misafir bölgesi ${stamp}`, warehouseId, weekdays: [1, 2, 3, 4, 5] })).id;
    await zones.replacePostalCodes(zoneId, [{ country: 'DE', postalCode: kod }]);
    await settings.set(MIN_BASKET_KEY, BOLGE_ASGARI, { scopeType: 'zone', scopeId: zoneId });
    await new ProductVatRateService(db).set({ productId, country: 'DE', vatRate: 7 });
    await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: ALMANYA_FIYATI, country: 'DE' });
    const oransiz = await new ProductService(db).create({
      name: { tr: `Oransız börek ${stamp}` },
      categoryId,
      variants: [{ label: { tr: '500 g' } }],
    });
    oransizUrunId = oransiz.product.id;
    oransizBoyId = oransiz.variants[0]!.id;
    await new PriceService(db).setPrice({ variantId: oransizBoyId, channel: 'b2c', amountCents: BIRIM_FIYAT });
  });

  afterAll(async () => {
    await settings.remove(MIN_BASKET_KEY, { scopeType: 'zone', scopeId: zoneId });
    await mustDelete(db, 'delivery_zone', (q) => q.eq('id', zoneId));
    await purgeTestData(db, { productIds: [oransizUrunId] });
  });

  // Sepet yerin ülkesini ve bölgesini okumaya geçmezse Almanya fiyatı ve bölgenin asgari sepeti görünmez; kırmızıya döner.
  it('Almanya adresinde sepet Almanya fiyatını ve bölgenin asgari sepetini okur', async () => {
    const body = await dataOf<{ lines: { unitPriceCents: number | null }[]; minBasketCents: number }>(await almanyaSepeti([satir()]));
    expect(body.lines[0]?.unitPriceCents).toBe(ALMANYA_FIYATI);
    expect(body.minBasketCents).toBe(BOLGE_ASGARI);
  });

  // Sepet okuması ya da mobil cevap satırın ülkesini taşımazsa Almanya'da satılmayan ürün yalnız "satışa kapalı" görünür; kırmızıya döner.
  it('Almanya oranı olmayan ürünün satırı ülkeyi söyler, oranlı ürününki söylemez', async () => {
    const body = await dataOf<{ lines: { variantId: string; unitPriceCents: number | null; notSoldIn?: string | null }[] }>(
      await almanyaSepeti([satir(), satir({ variantId: oransizBoyId })]),
    );
    const satirOf = (id: string) => body.lines.find((line) => line.variantId === id);
    expect(satirOf(oransizBoyId)).toMatchObject({ notSoldIn: 'DE', unitPriceCents: null });
    expect(satirOf(variantId)?.notSoldIn).toBeNull();
  });
});
