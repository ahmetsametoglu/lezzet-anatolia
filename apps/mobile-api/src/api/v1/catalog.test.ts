import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonDb,
  CategoryService,
  PriceService,
  ProductFamilyService,
  ProductImageService,
  ProductService,
  StockService,
  serviceDb,
  UserProfileService,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
// Testin beklediği şekil ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil
// DERLEME kırılır. Terfi etmiş şemanın (`catalog-api.schema.ts`) ilk tüketicisi de budur.
import type { CatalogCategory, CatalogPage, CatalogProductDetail, Product } from '@lezzet/types';
import { app } from '../../app';

/**
 * Katalog uçları uçtan uca — `app.request()` ile PORT AÇMADAN.
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b): zeminin TAMAMI bu dosyanın kendi damgalı satırlarıdır
 * (kategori, ürünler, fiyatlar, partiler, aile, iki depo, bir auth kullanıcısı) ve teardown
 * `purgeTestData` + `mustDelete` ile toplanır. **Küresel sayıya bakan tek bir iddia yok**: liste hep
 * kendi kategorimizle ya da damgamızla daraltılıyor — başka bir ajanın eklediği ürün bu dosyayı
 * kızartamaz.
 */
const stamp = Date.now();
/** Yalnız TEK ürünün adında geçen belirteç — `q` süzgecinin kanıtı damgadan da dar olmalı. */
const NEEDLE = `Zeytinyagli${stamp}`;

/** Fiyatlar bilerek sıra-dışı ve hepsi FARKLI: "artan fiyat" iddiası ekleme sırasıyla karışamasın. */
const PRICE_CENTS = { baklava: 3000, needle: 1000, borek: 2000, sade: 1500, fistikli: 1600 } as const;
/** Aynı boya yazılan TOPTAN fiyat — Bearer'lı B2B müşterinin perakendeden farkını ölçer. */
const B2B_NEEDLE_CENTS = 700;

const db = serviceDb();
const productIds: string[] = [];
const warehouseIds: string[] = [];
const profileIds: string[] = [];
const authUserIds: string[] = [];
let categoryId = '';
let categorySlug = '';
let familyId = '';
/** Partilerin yazıldığı depo — stok hâli iddiaları buradan besleniyor. */
let stockWarehouseId = '';

/** Kapaklı + galerili, İKİ boylu ürün — detay ve "çok boylu" iddialarının hedefi. */
let baklava: Product;
/** Adında `NEEDLE` geçen tek ürün; görseli YOK (boş galeri iddiası bunun üstünde). */
let needle: Product;
let needleVariantId = '';
let borek: Product;
/** TEK boylu aile üyeleri — `purchaseMode: 'quick'` ve çeşit kartları bunlarla sınanır. */
let sade: Product;
let fistikli: Product;
/** Satışta OLMAYAN ürün — ne listede ne doğrudan bağlantıda görünmeli. */
let passive: Product;

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

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

/**
 * Damgalı ürün kurulumu — ad, fiyat ve boy sayısı dışında her şey aynı, böylece iddialar tek
 * değişkene bakar. Fiyat ve parti BİRİNCİL boya yazılır: kartın fiyatı ilk aktif boydan okunur
 * (`toProduct`) ve `product_listing` sıralamayı da ondan alır (`primary_variant`).
 */
async function seedProduct(
  name: { tr: string; fr: string; de: string },
  priceCents: number,
  shippable: boolean,
  opts: { multiSize?: boolean } = {},
): Promise<{ product: Product; variantId: string }> {
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
    variants: opts.multiSize
      ? [
          { label: { tr: '1 kg', fr: '1 kg', de: '1 kg' }, netWeightG: 1000, sortOrder: 0 },
          { label: { tr: '500 g', fr: '500 g', de: '500 g' }, netWeightG: 500, sortOrder: 1 },
        ]
      : [{ label: { tr: '1 kg', fr: '1 kg', de: '1 kg' }, netWeightG: 1000, sortOrder: 0 }],
  });
  productIds.push(product.id);

  const variantId = first(variants, 'varyant').id;
  await new PriceService(db).setPrice({ variantId, channel: 'b2c', amountCents: priceCents });
  // Parti OLMADAN her ürün `out_of_stock` gelir ve hem kart hem çeşit kartı iddiaları anlamsızlaşır
  // (tükenen üye aile listesine hiç girmez). Depo boyutu ZORUNLU (DOMAIN §17).
  await new StockService(db).insert({
    warehouseId: stockWarehouseId,
    variantId,
    physicalQty: 10,
    expiryDate: dayOffset(60),
    purchasePriceCents: 100,
  });
  return { product, variantId };
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
  stockWarehouseId = wa.id;

  const category = await new CategoryService(db).create({
    name: { tr: `MAPI Kategori ${stamp}`, fr: `MAPI Catégorie ${stamp}`, de: `MAPI Kategorie ${stamp}` },
  });
  categoryId = category.id;
  categorySlug = category.slug;

  const products = new ProductService(db);
  baklava = (await seedProduct({ tr: `MAPI Baklava ${stamp}`, fr: `MAPI Baklava FR ${stamp}`, de: `MAPI Baklava DE ${stamp}` }, PRICE_CENTS.baklava, true, { multiSize: true })).product;
  const needleSeed = await seedProduct({ tr: `MAPI ${NEEDLE} dolma`, fr: `MAPI ${NEEDLE} feuilles`, de: `MAPI ${NEEDLE} Blätter` }, PRICE_CENTS.needle, true, { multiSize: true });
  needle = needleSeed.product;
  needleVariantId = needleSeed.variantId;
  borek = (await seedProduct({ tr: `MAPI Börek ${stamp}`, fr: `MAPI Börek FR ${stamp}`, de: `MAPI Börek DE ${stamp}` }, PRICE_CENTS.borek, false, { multiSize: true })).product;

  // ── ÜRÜN AİLESİ (05.15) — çeşit kartlarının zemini ─────────────────────────
  familyId = (await new ProductFamilyService(db).insert({ name: `MAPI Aile ${stamp}` })).id;
  sade = (await seedProduct({ tr: `MAPI Sade kek ${stamp}`, fr: `MAPI Gâteau nature ${stamp}`, de: `MAPI Kuchen ${stamp}` }, PRICE_CENTS.sade, true)).product;
  fistikli = (await seedProduct({ tr: `MAPI Fıstıklı kek ${stamp}`, fr: `MAPI Gâteau pistache ${stamp}`, de: `MAPI Pistazienkuchen ${stamp}` }, PRICE_CENTS.fistikli, true)).product;
  // Aile içi ETİKET ürün adından ayrıdır ve veri kısıtıyla zorunludur.
  await products.update({ id: sade.id, familyId, familyLabel: { tr: 'Sade', fr: 'Nature', de: 'Natur' }, familyPosition: 0 });
  await products.update({ id: fistikli.id, familyId, familyLabel: { tr: 'Fıstıklı', fr: 'Pistache', de: 'Pistazie' }, familyPosition: 1 });

  // Kapak + iki ek fotoğraf — kapağın HER ZAMAN başta olduğu ve tekrarlanmadığı sınanacak.
  await products.setImageKey(baklava.id, `catalog/products/mapi-cover-${stamp}.jpeg`);
  const images = new ProductImageService(db);
  await images.add(baklava.id, `catalog/products/mapi-gallery-1-${stamp}.jpeg`);
  await images.add(baklava.id, `catalog/products/mapi-gallery-2-${stamp}.jpeg`);

  const created = await products.create({
    name: { tr: `MAPI Pasif ${stamp}`, fr: `MAPI Passif ${stamp}`, de: `MAPI Passiv ${stamp}` },
    categoryId,
    status: 'passive',
  });
  passive = created.product;
  productIds.push(passive.id);
});

afterAll(async () => {
  // Aile dahil TÜM hedefler purge'te (`familyIds` talep karşılığı eklendi, 07.08) — silme sırası
  // bilgisi tek yerde (`cleanup.ts`), dosyada elle silme yok (CLAUDE §4b).
  await purgeTestData(db, {
    productIds,
    categoryIds: [categoryId],
    warehouseIds,
    profileIds,
    authUserIds,
    familyIds: familyId ? [familyId] : [],
  });
});

describe('GET /api/v1/categories', () => {
  it('200 + sözleşme şekli; damgalı kategori seçili dilde döner', async () => {
    const res = await app.request('/api/v1/categories?locale=fr');
    expect(res.status).toBe(200);

    const data = await dataOf<{ categories: CatalogCategory[] }>(res);
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
    const res1 = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=3`);
    expect(res1.status).toBe(200);

    const page1 = await dataOf<CatalogPage>(res1);
    expect(page1.products).toHaveLength(3);
    // Sayaç KENDİ kategorimizin sayacı: satışta olmayan altıncı ürün buraya girmez.
    expect(page1.total).toBe(5);
    expect(page1.nextCursor).toBeTruthy();

    const res2 = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=3&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`);
    const page2 = await dataOf<CatalogPage>(res2);
    expect(page2.products).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();

    // İMLECİN ASIL SÖZÜ: iki sayfa kesişmez ve beşi birden gelir.
    const ids = [...page1.products, ...page2.products].map((p) => p.id);
    expect(new Set(ids)).toEqual(new Set([baklava.id, needle.id, borek.id, sade.id, fistikli.id]));
  });

  it('bozuk imleç hata DEĞİL — liste baştan gelir', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=3&cursor=bu-imlec-degil`);
    expect(res.status).toBe(200);
    expect((await dataOf<CatalogPage>(res)).products).toHaveLength(3);
  });

  it('q süzer: yalnız adında belirteç geçen ürün döner (sayaç da onunla iner)', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`);
    expect(res.status).toBe(200);

    const page = await dataOf<CatalogPage>(res);
    expect(page.products).toHaveLength(1);
    expect(page.total).toBe(1);

    const card = first(page.products, 'ürün');
    expect(card.id).toBe(needle.id);
    expect(card.name).toBe(`MAPI ${NEEDLE} feuilles`);
    // Etiket ve eklenecek boy, sıra `sortOrder`dan gelir — dizi sırasından değil.
    expect(card.unitLabel).toBe('1 kg');
    expect(card.variantId).toBe(needleVariantId);
    // Boy LİSTESİ ve `shippable` kartta YOK: kart ilk aktif boya indirgenmiştir (sözleşme notu).
    expect(card).not.toHaveProperty('variants');
    expect(card).not.toHaveProperty('shippable');
  });

  it('ZİYARETÇİ kartında ticari bağlam var: fiyat, kıyas, stok hâli, satın alma yolu', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`);
    const card = first((await dataOf<CatalogPage>(res)).products, 'ürün');

    // Ziyaretçi = perakende liste fiyatı (Bearer yok → `VISITOR`).
    expect(card.priceCents).toBe(PRICE_CENTS.needle);
    // Kıyas fiyatı ÖDENEN fiyattan ve net ağırlıktan türer: 1000 c / 1 kg → 1000 c/kg.
    expect(card.comparisonCents).toBe(1000);
    // Parti var → dört hâlden biri: "alınabilir". `soldOut` bunun daraltılmışı.
    expect(card.stockStatus).toBe('available');
    expect(card.soldOut).toBe(false);
    // Çok boylu ürün listeden EKLENMEZ — boy seçimi atlanamaz.
    expect(card.purchaseMode).toBe('options');
    // Çeşit satırının SAYISI ("2 seçenek"); metni cihaz kurar, API sayı taşır. `purchaseMode` ile
    // aynı kümeden türediği için ikisi çelişemez.
    expect(card.variantCount).toBe(2);
    // Teklif yok: ne üstü çizili referans, ne adet tavanı, ne çıpalı parti.
    expect(card.wasCents).toBeUndefined();
    expect(card.limitLabel).toBeNull();
    expect(card.stockId).toBeNull();
  });

  it('TEK boylu ürün listeden eklenebilir — `purchaseMode: quick`', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&q=${encodeURIComponent(`Sade kek ${stamp}`)}`);
    const card = first((await dataOf<CatalogPage>(res)).products, 'ürün');
    expect(card.id).toBe(sade.id);
    expect(card.purchaseMode).toBe('quick');
    expect(card.priceCents).toBe(PRICE_CENTS.sade);
    // Tek boyda sayı 1 gelir ve satırı ÇİZMEME kararı cihazındır — API "seçenek yok" diye bir
    // özel değer (0/null) uydurmaz: bir boy vardır, yalnız seçilecek bir şey yoktur.
    expect(card.variantCount).toBe(1);
  });

  it("tanınmayan kategori slug'ı 400 — sessizce süzgeçsiz liste dönmez", async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=boyle-bir-kategori-yok-${stamp}`);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'unknown_category' });
  });

  it('satışta olmayan ürün listede yok', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&limit=50`);
    const ids = (await dataOf<CatalogPage>(res)).products.map((p) => p.id);
    expect(ids).not.toContain(passive.id);
  });

  it('DEPO BOYUTU: fiyat sıralaması artan, her ürün TAM BİR KEZ ve KART aynı fiyatı yazıyor', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&sort=priceAsc&limit=50`);
    expect(res.status).toBe(200);

    const rows = (await dataOf<CatalogPage>(res)).products;
    const ids = rows.map((p) => p.id);
    // Beklenen sıra FİYATTAN türetilir, elle yazılmaz.
    const expected = [
      { id: needle.id, cents: PRICE_CENTS.needle },
      { id: sade.id, cents: PRICE_CENTS.sade },
      { id: fistikli.id, cents: PRICE_CENTS.fistikli },
      { id: borek.id, cents: PRICE_CENTS.borek },
      { id: baklava.id, cents: PRICE_CENTS.baklava },
    ]
      .sort((a, b) => a.cents - b.cents)
      .map((p) => p.id);
    expect(ids).toEqual(expected);
    // Asıl iddia: görünüm (aktif depo × ürün) grain'inde ve iki EK aktif depo açıldı — depo
    // süzgeci düşseydi her ürün burada birden çok kez görünürdü.
    expect(new Set(ids).size).toBe(ids.length);

    // **`product_listing` ile KART ayrışmıyor:** sıralamanın kullandığı fiyat, kartta yazan fiyat.
    // İkisi ayrı kaynaktan okunuyor (görünüm vs. `resolvePrice`), o yüzden ayrışabilirler — ve
    // ayrıştıkları gün katalog kendi kendisiyle çelişir. Sıra artansa fiyatlar da artan olmalı.
    const cents = rows.map((p) => p.priceCents);
    expect(cents).toEqual([...cents].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(cents).toEqual([PRICE_CENTS.needle, PRICE_CENTS.sade, PRICE_CENTS.fistikli, PRICE_CENTS.borek, PRICE_CENTS.baklava]);
  });

  it('bozuk sort değeri hata değil, varsayılana düşer (web ile aynı hoşgörü)', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&category=${categorySlug}&sort=ucuzdan-pahaliya`);
    expect(res.status).toBe(200);
    expect((await dataOf<CatalogPage>(res)).products).toHaveLength(5);
  });
});

describe('yakın-SKT teklifi — YER BİLİNMEZKEN gösterilmez', () => {
  it('açık teklifli partide bile kart LİSTE fiyatını yazar, `wasCents` doğmaz', async () => {
    // Karar (01.08, kullanıcı): teklif bir PARTİYE bağlıdır, parti bir depodadır. Mobil istemci
    // bugün posta kodu göndermiyor (yer çözümü henüz application'a terfi etmedi), yani uç web'in
    // posta-kodsuz ziyaretçisiyle aynı hâlde: indirimli fiyatı gösterip ödemede yükseltmek verilmiş
    // bir sözü bozmak olurdu. `loadProductContext` teklif partilerini yalnız depo belliyken okur.
    await db.from('stock').update({ offer_price: 3 }).eq('variant_id', needleVariantId);
    try {
      const res = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`);
      const card = first((await dataOf<CatalogPage>(res)).products, 'ürün');

      expect(card.priceCents).toBe(PRICE_CENTS.needle);
      expect(card.wasCents).toBeUndefined();
      // Çıpa da doğmaz: indirim kazanmadıysa kalem bir partiye bağlanmaz.
      expect(card.stockId).toBeNull();
      expect(card.limitLabel).toBeNull();
    } finally {
      // Sonraki testler bu ürünü teklifsiz bekliyor.
      await db.from('stock').update({ offer_price: null }).eq('variant_id', needleVariantId);
    }
  });
});

describe('GET /api/v1/products/:slug', () => {
  it('200 + detay: açıklama, galeri (kapak başta), kategori ve yasal beyan', async () => {
    const res = await app.request(`/api/v1/products/${baklava.slug}?locale=de`);
    expect(res.status).toBe(200);

    const detail = await dataOf<CatalogProductDetail>(res);
    expect(detail.id).toBe(baklava.id);
    expect(detail.name).toBe(`MAPI Baklava DE ${stamp}`);
    expect(detail.description).toBe(`DE MAPI Baklava DE ${stamp}`);
    expect(detail.category?.id).toBe(categoryId);
    expect(detail.category?.name).toBe(`MAPI Kategorie ${stamp}`);
    expect(detail.shippable).toBe(true);

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
  });

  it('BOY düzeyinde fiyat ve stok — fiyatsız boy `null`, partisiz boy tükenmiş', async () => {
    const res = await app.request(`/api/v1/products/${baklava.slug}?locale=fr`);
    const detail = await dataOf<CatalogProductDetail>(res);

    expect(detail.variants.map((v) => v.label)).toEqual(['1 kg', '500 g']);
    expect(detail.variants.map((v) => v.netWeightG)).toEqual([1000, 500]);

    const [buyuk, kucuk] = detail.variants;
    // Fiyat ve parti BİRİNCİL boya yazıldı.
    expect(buyuk?.priceCents).toBe(PRICE_CENTS.baklava);
    expect(buyuk?.comparisonCents).toBe(PRICE_CENTS.baklava);
    expect(buyuk?.stockStatus).toBe('available');
    expect(buyuk?.soldOut).toBe(false);

    // **`null` = bu kanalda fiyatı yok → boy seçilebilir ama satın alınamaz** (DOMAIN §5).
    // Sıfır YAZILMAZ: "0,00 €" bedava görünürdü (`CLAUDE §1`).
    expect(kucuk?.priceCents).toBeNull();
    expect(kucuk?.comparisonCents).toBeNull();
    // Partisi olmayan boy hiçbir depoda yok → gerçek tükenme.
    expect(kucuk?.stockStatus).toBe('out_of_stock');
    expect(kucuk?.soldOut).toBe(true);

    // Detay kartı `.extend` ETMEZ: ürün düzeyinde fiyat/satın alma yolu YOK, ikisi de boydan okunur.
    expect(detail).not.toHaveProperty('priceCents');
    expect(detail).not.toHaveProperty('purchaseMode');
  });

  it('AİLE: çeşit kartları etiket + başlangıç fiyatıyla gelir, bakılan çeşit işaretli', async () => {
    const res = await app.request(`/api/v1/products/${sade.slug}?locale=fr`);
    const detail = await dataOf<CatalogProductDetail>(res);

    expect(detail.family).toHaveLength(2);
    const bakilan = detail.family.find((f) => f.isCurrent);
    const kardes = detail.family.find((f) => !f.isCurrent);
    expect(bakilan?.slug).toBe(sade.slug);
    // **Aile içi etiket ürün adı DEĞİL**: kart "Nature" yazar, "MAPI Gâteau nature …" değil.
    expect(bakilan?.label).toBe('Nature');
    expect(kardes?.slug).toBe(fistikli.slug);
    expect(kardes?.label).toBe('Pistache');
    // Başlangıç fiyatı kartın fiyatıyla AYNI kaynaktan (`toProduct`) — ikinci bir hesap yok.
    expect(bakilan?.fromPriceCents).toBe(PRICE_CENTS.sade);
    expect(kardes?.fromPriceCents).toBe(PRICE_CENTS.fistikli);
  });

  it('BENZER: aynı kategoriden kartlar gelir, kendi ailesi HİÇ girmez', async () => {
    const res = await app.request(`/api/v1/products/${sade.slug}?locale=fr`);
    const detail = await dataOf<CatalogProductDetail>(res);

    expect(detail.similar.length).toBeGreaterThan(0);
    const ids = detail.similar.map((p) => p.id);
    // Kural 1 (`pickSimilar`): bakılan ürünün kendi ailesi tamamen dışarıda — o zaten yukarıda.
    expect(ids).not.toContain(sade.id);
    expect(ids).not.toContain(fistikli.id);
    // Benzer kartlar da TAM kart: fiyat ve stok hâli olmadan çizilemezler.
    const card = first(detail.similar, 'benzer ürün');
    expect(typeof card.priceCents === 'number' || card.priceCents === null).toBe(true);
    expect(card.stockStatus).toBe('available');
  });

  it('ailesiz üründe `family` boş — bölüm hiç çizilmez', async () => {
    const res = await app.request(`/api/v1/products/${baklava.slug}?locale=fr`);
    expect((await dataOf<CatalogProductDetail>(res)).family).toEqual([]);
  });

  it('görseli olmayan üründe galeri boş, kırpma yine dolu', async () => {
    const res = await app.request(`/api/v1/products/${needle.slug}?locale=fr`);
    const detail = await dataOf<CatalogProductDetail>(res);
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

/**
 * **Kimlik İSTEĞE BAĞLI: fiyatı değiştirir, kapıyı değiştirmez.**
 *
 * Katalog `bearerAuth`ın önünde bağlı ve öyle kalmalı — ürünü görmek için hesap açtırmak, uygulamayı
 * giriş kapısıyla açmak olurdu (02-mimari §4). Bearer'ın tek işi fiyatın kişiselleşmesi.
 */
describe('katalog oturumsuz gezilir; Bearer YALNIZ fiyatı değiştirir', () => {
  it('Bearer OLMADAN 200 döner — /me ise 401 (kapı yerinde duruyor)', async () => {
    expect((await app.request('/api/v1/categories?locale=fr')).status).toBe(200);
    expect((await app.request('/api/v1/me')).status).toBe(401);
  });

  it('BOZUK Bearer 401 DEĞİL: ziyaretçi fiyatıyla 200 — süresi dolmuş token katalogu kapatmaz', async () => {
    // Web'de karşılığı süresi dolmuş oturum çerezidir: `getSessionUser` null döner, sayfa açılmaya
    // devam eder ve fiyat liste fiyatına düşer. Uygulamanın haftalarca açılmadığı bir cihazda 401
    // vermek, müşteriye vitrin yerine hata ekranı göstermek olurdu.
    const res = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`, {
      headers: { authorization: 'Bearer bu-bir-token-degil' },
    });
    expect(res.status).toBe(200);
    expect(first((await dataOf<CatalogPage>(res)).products, 'ürün').priceCents).toBe(PRICE_CENTS.needle);
  });

  it('biçimsiz Authorization başlığı da ziyaretçiye düşer (200)', async () => {
    const res = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`, {
      headers: { authorization: 'Basic a2VkaQ==' },
    });
    expect(res.status).toBe(200);
    expect(first((await dataOf<CatalogPage>(res)).products, 'ürün').priceCents).toBe(PRICE_CENTS.needle);
  });

  it('GEÇERLİ Bearer + onaylı B2B müşteri → toptan fiyat; aynı ürün ziyaretçide perakende', async () => {
    // Auth kullanıcısı → trigger profil satırını açar (`0002`). Kimlik zinciri buradan kurulur:
    // auth kimliği ≠ müşteri kimliği (`apps/web/lib/guard.ts:70-74`), uç `findByAuthUserId` ile çevirir.
    const email = `mapi-b2b-${stamp}@example.com`;
    const password = `Mapi!${stamp}`;
    const { data: created, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !created.user) throw new Error(`test kullanıcısı açılamadı: ${createError?.message ?? 'kullanıcı yok'}`);
    authUserIds.push(created.user.id);

    const profiles = new UserProfileService(db);
    const profile = await profiles.findByAuthUserId(created.user.id);
    if (!profile) throw new Error('auth trigger profil satırı açmadı');
    profileIds.push(profile.id);
    // ONAYSIZ şirket B2C'dir (DOMAIN §10) — bu test onaylı hâli ölçüyor.
    await profiles.update({ id: profile.id, type: 'company', b2bApproved: true });
    await new PriceService(db).setPrice({ variantId: needleVariantId, channel: 'b2b', amountCents: B2B_NEEDLE_CENTS });

    const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
    if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);

    const authed = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`, {
      headers: { authorization: `Bearer ${session.session.access_token}` },
    });
    expect(authed.status).toBe(200);
    expect(first((await dataOf<CatalogPage>(authed)).products, 'ürün').priceCents).toBe(B2B_NEEDLE_CENTS);

    // Aynı istek kimliksiz atıldığında perakende kalır — kişiselleşme oturuma bağlı, ürüne değil.
    const anon = await app.request(`/api/v1/products?locale=fr&q=${NEEDLE}`);
    expect(first((await dataOf<CatalogPage>(anon)).products, 'ürün').priceCents).toBe(PRICE_CENTS.needle);
  });
});
