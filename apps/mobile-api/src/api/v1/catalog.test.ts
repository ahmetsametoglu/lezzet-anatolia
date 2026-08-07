import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  PriceService,
  ProductImageService,
  ProductService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { Product } from '@lezzet/types';
import { app } from '../../app';

/**
 * Katalog uçları uçtan uca — `app.request()` ile PORT AÇMADAN.
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): zeminin TAMAMI bu dosyanın kendi damgalı satırlarıdır
 * (kategori, ürünler, fiyatlar, iki depo) ve teardown `purgeTestData` ile toplanır. **Küresel
 * sayıya bakan tek bir iddia yok**: liste hep kendi kategorimizle daraltılıyor, sayaç da o
 * kategorinin sayacı — başka bir ajanın eklediği ürün bu dosyayı kızartamaz.
 */
const stamp = Date.now();
/** Yalnız TEK ürünün adında geçen belirteç — `q` süzgecinin kanıtı damgadan da dar olmalı. */
const NEEDLE = `Zeytinyagli${stamp}`;

/** Fiyatlar bilerek sıra-dışı: "artan fiyat" iddiası ekleme sırasıyla karışamasın. */
const PRICE_CENTS = { baklava: 3000, needle: 1000, borek: 2000 } as const;

const db = serviceDb();
const productIds: string[] = [];
const warehouseIds: string[] = [];
let categoryId = '';
let categorySlug = '';
/** Kapaklı + galerili ürün — detay iddialarının hedefi. */
let baklava: Product;
/** Adında `NEEDLE` geçen tek ürün; görseli YOK (boş galeri iddiası bunun üstünde). */
let needle: Product;
let borek: Product;
/** Satışta OLMAYAN ürün — ne listede ne doğrudan bağlantıda görünmeli. */
let passive: Product;

interface ApiImage {
  url: string | null;
  crop: { x: number; y: number; zoom: number };
}

interface ApiProduct {
  id: string;
  slug: string;
  name: string;
  shippable: boolean;
  unitLabel: string;
  image: ApiImage;
  variants: Array<{ id: string; label: string; netWeightG: number | null }>;
}

interface ApiPage {
  products: ApiProduct[];
  total: number;
  nextCursor: string | null;
}

interface ApiDetail extends ApiProduct {
  description: string | null;
  gallery: ApiImage[];
  category: { id: string; slug: string; name: string } | null;
  declaration: {
    ingredients: Array<{ text: string; strong: boolean }> | null;
    storage: Array<{ text: string; strong: boolean }> | null;
    nutrition: { energyKcal: number | null } | null;
    allergens: string[];
    traces: string[];
  };
}

/** Zarfı açar; `error` doluysa iddia orada patlasın diye ayrıca kontrol edilir. */
async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

/** İlk öğe — boşsa testi anlaşılır bir cümleyle düşürür (indeks erişimi `undefined` sızdırmasın). */
function first<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (!row) throw new Error(`beklenen ${what} listesi boş geldi`);
  return row;
}

/** Damgalı ürün kurulumu — ad dışında her şey aynı, böylece iddialar tek değişkene bakar. */
async function seedProduct(name: { tr: string; fr: string; de: string }, priceCents: number, shippable: boolean): Promise<Product> {
  const { product, variants } = await new ProductService(db).create({
    name,
    categoryId,
    status: 'active',
    shippable,
    description: { tr: `TR ${name.tr}`, fr: `FR ${name.fr}`, de: `DE ${name.de}` },
    ingredients: { tr: 'Un, **fındık**, su', fr: 'Farine, **noisette**, eau', de: 'Mehl, **Haselnuss**, Wasser' },
    storageInstructions: { tr: '**Buzdolabında** saklayın', fr: 'Conserver au **réfrigérateur**', de: 'Im **Kühlschrank** lagern' },
    nutrition: { energyKj: 1000, energyKcal: 240, fatG: 12, saturatedFatG: null, carbohydrateG: null, sugarsG: null, proteinG: null, saltG: null },
    allergens: ['gluten', 'sert_kabuklu'],
    traces: ['susam'],
    // Boy SIRASI bilerek ters yazılıyor: büyük boy `sortOrder: 0`, küçük boy `sortOrder: 1`.
    // `unitLabel` "ilk aktif boy" olduğuna göre beklenen etiket 1 kg'dır — sıra sabitlenmemiş
    // olsaydı (PostgREST gömülü ilişki sırası garantisiz) bu iddia rastgele kırılırdı.
    variants: [
      { label: { tr: '1 kg', fr: '1 kg', de: '1 kg' }, netWeightG: 1000, sortOrder: 0 },
      { label: { tr: '500 g', fr: '500 g', de: '500 g' }, netWeightG: 500, sortOrder: 1 },
    ],
  });
  productIds.push(product.id);
  // Fiyat BİRİNCİL boya yazılır: `product_listing` sıralamayı ondan okur (0032 `primary_variant`).
  await new PriceService(db).setPrice({ variantId: first(variants, 'varyant').id, channel: 'b2c', amountCents: priceCents });
  return product;
}

beforeAll(async () => {
  // İKİ EK AKTİF DEPO: fiyat sıralaması `product_listing` görünümünden okunuyor ve o görünümün
  // grain'i (aktif depo × ürün) + "yeri bilinmeyen" satırıdır. Depo boyutu süzülmezse aynı ürün
  // sayfada depo sayısı kadar tekrarlar. Yerel yığında kaç depo olduğuna GÜVENMİYORUZ (başka bir
  // ajan pasifleyebilir) — testin kendisi çoğulluğu garanti ediyor.
  const [wa, wb] = await Promise.all([
    createTestWarehouse(db, { label: 'MAPIA' }),
    createTestWarehouse(db, { label: 'MAPIB' }),
  ]);
  warehouseIds.push(wa.id, wb.id);

  const category = await new CategoryService(db).create({
    name: { tr: `MAPI Kategori ${stamp}`, fr: `MAPI Catégorie ${stamp}`, de: `MAPI Kategorie ${stamp}` },
  });
  categoryId = category.id;
  categorySlug = category.slug;

  baklava = await seedProduct({ tr: `MAPI Baklava ${stamp}`, fr: `MAPI Baklava FR ${stamp}`, de: `MAPI Baklava DE ${stamp}` }, PRICE_CENTS.baklava, true);
  needle = await seedProduct({ tr: `MAPI ${NEEDLE} dolma`, fr: `MAPI ${NEEDLE} feuilles`, de: `MAPI ${NEEDLE} Blätter` }, PRICE_CENTS.needle, true);
  borek = await seedProduct({ tr: `MAPI Börek ${stamp}`, fr: `MAPI Börek FR ${stamp}`, de: `MAPI Börek DE ${stamp}` }, PRICE_CENTS.borek, false);

  // Kapak + iki ek fotoğraf — kapağın HER ZAMAN başta olduğu ve tekrarlanmadığı sınanacak.
  await new ProductService(db).setImageKey(baklava.id, `catalog/products/mapi-cover-${stamp}.jpeg`);
  const images = new ProductImageService(db);
  await images.add(baklava.id, `catalog/products/mapi-gallery-1-${stamp}.jpeg`);
  await images.add(baklava.id, `catalog/products/mapi-gallery-2-${stamp}.jpeg`);

  const created = await new ProductService(db).create({
    name: { tr: `MAPI Pasif ${stamp}`, fr: `MAPI Passif ${stamp}`, de: `MAPI Passiv ${stamp}` },
    categoryId,
    status: 'passive',
  });
  passive = created.product;
  productIds.push(passive.id);
});

afterAll(async () => {
  await purgeTestData(db, { productIds, categoryIds: [categoryId], warehouseIds });
});

describe('GET /api/v1/categories', () => {
  it('200 + sözleşme şekli; damgalı kategori seçili dilde döner', async () => {
    const res = await app.request('/api/v1/categories?locale=fr');
    expect(res.status).toBe(200);

    const data = await dataOf<{ categories: Array<{ id: string; slug: string; name: string; image: ApiImage }> }>(res);
    const mine = data.categories.find((c) => c.id === categoryId);
    expect(mine?.slug).toBe(categorySlug);
    expect(mine?.name).toBe(`MAPI Catégorie ${stamp}`);
    // Görsel künyesi HER ZAMAN dolu bir ŞEKİLDİR: URL null olabilir (görsel yok), kırpma olamaz.
    expect(mine?.image.crop).toEqual({ x: 50, y: 50, zoom: 100 });
  });

  it("locale yoksa 400 invalid_locale — sessizce TR'ye düşmez", async () => {
    const res = await app.request('/api/v1/categories');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_locale' });
  });
});

describe('GET /api/v1/products', () => {
  it('ilk sayfa + nextCursor; ikinci sayfa kesişmez ve listeyi bitirir', async () => {
    const res1 = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=2`);
    expect(res1.status).toBe(200);

    const page1 = await dataOf<ApiPage>(res1);
    expect(page1.products).toHaveLength(2);
    // Sayaç KENDİ kategorimizin sayacı: satışta olmayan dördüncü ürün buraya girmez.
    expect(page1.total).toBe(3);
    expect(page1.nextCursor).toBeTruthy();

    const res2 = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=2&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`);
    const page2 = await dataOf<ApiPage>(res2);
    expect(page2.products).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    // İMLECİN ASIL SÖZÜ: iki sayfa kesişmez ve üçü birden gelir.
    const ids = [...page1.products, ...page2.products].map((p) => p.id);
    expect(new Set(ids)).toEqual(new Set([baklava.id, needle.id, borek.id]));
  });

  it('bozuk imleç hata DEĞİL — liste baştan gelir', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=2&cursor=bu-imlec-degil`);
    expect(res.status).toBe(200);
    expect((await dataOf<ApiPage>(res)).products).toHaveLength(2);
  });

  it('q süzer: yalnız adında belirteç geçen ürün döner (sayaç da onunla iner)', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`);
    expect(res.status).toBe(200);

    const page = await dataOf<ApiPage>(res);
    expect(page.products).toHaveLength(1);
    expect(page.total).toBe(1);

    const card = first(page.products, 'ürün');
    expect(card.id).toBe(needle.id);
    expect(card.name).toBe(`MAPI ${NEEDLE} feuilles`);
    // Sıra `sortOrder`dan gelir, dizi sırasından değil.
    expect(card.unitLabel).toBe('1 kg');
    expect(card.variants.map((v) => v.label)).toEqual(['1 kg', '500 g']);
    expect(card.variants.map((v) => v.netWeightG)).toEqual([1000, 500]);
    // Ticari bağlam SÖZLEŞMEDE YOK (terfi bekliyor) — `null` bile göndermiyoruz.
    expect(card).not.toHaveProperty('priceCents');
    expect(card).not.toHaveProperty('soldOut');
  });

  it("tanınmayan kategori slug'ı 400 — sessizce süzgeçsiz liste dönmez", async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=boyle-bir-kategori-yok-${stamp}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'unknown_category' });
  });

  it('satışta olmayan ürün listede yok', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=50`);
    const ids = (await dataOf<ApiPage>(res)).products.map((p) => p.id);
    expect(ids).not.toContain(passive.id);
  });

  it('DEPO BOYUTU: fiyat sıralaması artan ve her ürün TAM BİR KEZ', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&sort=priceAsc&limit=50`);
    expect(res.status).toBe(200);

    const ids = (await dataOf<ApiPage>(res)).products.map((p) => p.id);
    // Beklenen sıra FİYATTAN türetilir, elle yazılmaz.
    const expected = [
      { id: needle.id, cents: PRICE_CENTS.needle },
      { id: borek.id, cents: PRICE_CENTS.borek },
      { id: baklava.id, cents: PRICE_CENTS.baklava },
    ]
      .sort((a, b) => a.cents - b.cents)
      .map((p) => p.id);
    expect(ids).toEqual(expected);
    // Asıl iddia: görünüm (aktif depo × ürün) grain'inde ve iki EK aktif depo açıldı — depo
    // süzgeci düşseydi her ürün burada birden çok kez görünürdü.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('bozuk sort değeri hata değil, varsayılana düşer (web ile aynı hoşgörü)', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&sort=ucuzdan-pahaliya`);
    expect(res.status).toBe(200);
    expect((await dataOf<ApiPage>(res)).products).toHaveLength(3);
  });
});

describe('GET /api/v1/products/:slug', () => {
  it('200 + detay: açıklama, galeri (kapak başta), kategori ve yasal beyan', async () => {
    const res = await app.request(`/api/v1/products/${baklava.slug}?locale=de`);
    expect(res.status).toBe(200);

    const detail = await dataOf<ApiDetail>(res);
    expect(detail.id).toBe(baklava.id);
    expect(detail.name).toBe(`MAPI Baklava DE ${stamp}`);
    expect(detail.description).toBe(`DE MAPI Baklava DE ${stamp}`);
    expect(detail.category?.id).toBe(categoryId);
    expect(detail.category?.name).toBe(`MAPI Kategorie ${stamp}`);

    // Kapak + iki galeri fotoğrafı; kapak BAŞTA ve tekrarlanmıyor.
    expect(detail.gallery).toHaveLength(3);
    expect(first(detail.gallery, 'galeri').url).toBe(detail.image.url);
    expect(new Set(detail.gallery.map((g) => g.url)).size).toBe(3);

    // `**vurgu**` SUNUCUDA çözülür — cihaza ham işaret gitmez.
    expect(detail.declaration.ingredients).toEqual([
      { text: 'Mehl, ', strong: false },
      { text: 'Haselnuss', strong: true },
      { text: ', Wasser', strong: false },
    ]);
    expect(detail.declaration.storage?.some((s) => s.strong && s.text === 'Kühlschrank')).toBe(true);
    expect(detail.declaration.nutrition?.energyKcal).toBe(240);
    expect(detail.declaration.allergens).toEqual(['gluten', 'sert_kabuklu']);
    expect(detail.declaration.traces).toEqual(['susam']);
    // Terfi bekleyen bölümler sözleşmede HİÇ YOK (boş dizi de değil — bkz. `contract.ts`).
    expect(detail).not.toHaveProperty('family');
    expect(detail).not.toHaveProperty('similar');
  });

  it('görseli olmayan üründe galeri boş, kırpma yine dolu', async () => {
    const res = await app.request(`/api/v1/products/${needle.slug}?locale=fr`);
    const detail = await dataOf<ApiDetail>(res);
    expect(detail.gallery).toEqual([]);
    expect(detail.image.url).toBeNull();
    expect(detail.image.crop).toEqual({ x: 50, y: 50, zoom: 100 });
  });

  it('olmayan slug 404 product_not_found', async () => {
    const res = await app.request(`/api/v1/products/boyle-bir-urun-yok-${stamp}?locale=fr`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'product_not_found' });
  });

  it('satışta olmayan ürün doğrudan bağlantıyla da AÇILMAZ (404)', async () => {
    const res = await app.request(`/api/v1/products/${passive.slug}?locale=fr`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'product_not_found' });
  });

  it('locale yoksa 400 invalid_locale', async () => {
    const res = await app.request(`/api/v1/products/${baklava.slug}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_locale' });
  });
});

describe('katalog oturumsuz gezilir', () => {
  it('Bearer OLMADAN 200 döner — /me ise 401 (kapı yerinde duruyor)', async () => {
    expect((await app.request('/api/v1/categories?locale=fr')).status).toBe(200);
    expect((await app.request('/api/v1/me')).status).toBe(401);
  });
});
