import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  CollectionService,
  PriceService,
  ProductService,
  RecipeService,
  StockService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
// Testin beklediği şekil ELLE YAZILMAZ, sözleşmeden gelir (`catalog.test.ts` emsali).
import { HomeSchema, type Category, type Collection, type Home } from '@lezzet/types';
import { app } from '../../app';
import { composeHomeBands } from '../../lib/home';

/**
 * Vitrin ucu uçtan uca — `app.request()` ile PORT AÇMADAN.
 *
 * Paylaşılan-DB disiplini (CLAUDE §4b) burada İKİ katmanla kurulur, çünkü uç KÜRESEL listeden
 * seçiyor ve seçimin bir yarısı RASTGELE:
 *
 *   · POZİTİF iddialar (kim girer, altyazı/sayaç nereden) `composeHomeBands`a KENDİ kurduğumuz
 *     havuzlar + SABİTLENMİŞ rastgelelik (`rng` parametre — `Rng` künyesi) verilerek atılır: başka
 *     ajanın işaretlediği bir kategori seçimi değiştiremez, sabit üreteç aynı diziyi verir.
 *   · Uç düzeyinde yalnız DEĞİŞMEZLER ve NEGATİFLER ölçülür: işaretsiz/boş kaynak kurala göre
 *     HİÇBİR seçimde giremez, sayaç asla 0 taşımaz — bunlar küresel veriden bağımsız doğrudur.
 *
 * Tarif şeridi küresel sıradan okur (rastgelelik yok): damgalı tarif `sortOrder: -1_000_000` ile
 * listenin başına ÇİVİLENİR — öteki dosyalar tarif sırasını hep varsayılandan (kuyruğa ekleme)
 * açar, negatif sıra yalnız bu dosyanın tekniğidir.
 */
const stamp = Date.now();
const db = serviceDb();

const productIds: string[] = [];
const categoryIds: string[] = [];
const collectionIds: string[] = [];
const recipeIds: string[] = [];
const warehouseIds: string[] = [];

let catFeatured: Category;
let catPlain: Category;
let colWithMembers: Collection;
let colEmpty: Collection;
let colPlain: Collection;
/** Üyeler — catFeatured'ın AKTİF iki ürünü; pasif üçüncüsü sayaç iddiasının kanıtı. */
let memberIds: string[] = [];
let recipeSlug = '';
let draftRecipeSlug = '';
/** Teklife açılan parti bu boyda — "yer bilinmezken fırsat görünmez" sözünün hedefi. */
let offerVariantId = '';

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Zarfı açar; `error` doluysa iddia orada patlasın diye ayrıca kontrol edilir. */
async function dataOf<T>(res: Response): Promise<T> {
  const envelope = (await res.json()) as { data: T; error: string | null };
  expect(envelope.error).toBeNull();
  return envelope.data;
}

const tr3 = (tr: string, fr: string, de: string) => ({ tr, fr, de });

/* YAYIN KISITININ ŞARTI (05.36): `status: 'active'` ürün ad · açıklama · içindekiler · saklama
   metnini ÜÇ DİLDE dolu ister (`product_publish_requires_all_locales`). Bu dosyanın adı zaten üç
   dilliydi; eksik olan öteki üç metindi. Kısıt karşılanmazsa `beforeAll` düşer ve testler DÜŞMEZ,
   ATLANIR — sebebi dosyanın konusuyla (vitrin ucu) ilgisiz göründüğü için en zor okunan kırılma. */
const yayinaHazir = {
  description: tr3('Vitrin testi ürünü', 'Produit de test', 'Testprodukt'),
  ingredients: tr3('Un, su, tuz', 'Farine, eau, sel', 'Mehl, Wasser, Salz'),
  storageInstructions: tr3('Serin yerde saklayın', 'Conserver au frais', 'Kühl lagern'),
};

beforeAll(async () => {
  const wa = await createTestWarehouse(db, { label: 'VHOME' });
  warehouseIds.push(wa.id);

  const categories = new CategoryService(db);
  // İşaretli kategori ALTYAZILI: bant altyazısının `tagline`dan (05.17) geldiği burada ölçülür.
  const createdCat = await categories.create({
    name: tr3(`VHOME Kat ${stamp}`, `VHOME Cat FR ${stamp}`, `VHOME Kat DE ${stamp}`),
    tagline: tr3('El açması', 'Fait main', 'Handgemacht'),
  });
  catFeatured = await categories.setFeatured(createdCat.id, true);
  catPlain = await categories.create({ name: tr3(`VHOME Sade ${stamp}`, `VHOME Sade FR ${stamp}`, `VHOME Sade DE ${stamp}`) });
  categoryIds.push(catFeatured.id, catPlain.id);

  const products = new ProductService(db);
  const mk = async (name: string, categoryId: string, status: 'active' | 'passive') => {
    /* Yayın metinleri PASİF üründe de veriliyor: kısıt onu aramıyor ama fikstürü iki dala bölmek,
       ileride biri `passive`i `active` yaptığında sessizce atlanan bir dosya bırakırdı. */
    const { product } = await products.create({ name: tr3(name, `${name} FR`, `${name} DE`), categoryId, status, ...yayinaHazir });
    productIds.push(product.id);
    return product;
  };
  // Sayaç iddiasının zemini: 2 AKTİF + 1 PASİF — kart "2" demeli, üyelik/kayıt sayısı olan 3'ü değil.
  const p1 = await mk(`VHOME Urun A ${stamp}`, catFeatured.id, 'active');
  const p2 = await mk(`VHOME Urun B ${stamp}`, catFeatured.id, 'active');
  await mk(`VHOME Pasif ${stamp}`, catFeatured.id, 'passive');
  memberIds = [p1.id, p2.id];

  // Tarif kalemi ve teklif partisi için BOYLU ürün — bantlara girmeyen sade kategoride durur ki
  // işaretli kategorinin sayacını oynatmasın.
  const offerSeed = await products.create({
    name: tr3(`VHOME Boylu ${stamp}`, `VHOME Boylu FR ${stamp}`, `VHOME Boylu DE ${stamp}`),
    categoryId: catPlain.id,
    status: 'active',
    ...yayinaHazir,
    variants: [{ label: tr3('1 kg', '1 kg', '1 kg'), netWeightG: 1000, sortOrder: 0 }],
  });
  productIds.push(offerSeed.product.id);
  const offerVariant = offerSeed.variants[0];
  if (!offerVariant) throw new Error('boylu ürün varyantsız doğdu');
  offerVariantId = offerVariant.id;
  await new PriceService(db).setPrice({ variantId: offerVariantId, channel: 'b2c', amountCents: 1200 });
  await new StockService(db).insert({
    warehouseId: wa.id,
    variantId: offerVariantId,
    physicalQty: 10,
    expiryDate: dayOffset(5),
    purchasePriceCents: 100,
  });
  // Parti TEKLİFE AÇILIR (ham kolon — `catalog.test.ts` emsali): fırsat testi "teklif VARKEN bile
  // yer bilinmeden gösterilmez" sözünü ölçüyor; teklifsiz zeminde o iddia boş bir totoloji olurdu.
  await db.from('stock').update({ offer_price: 3 }).eq('variant_id', offerVariantId);

  const collections = new CollectionService(db);
  const createdCol = await collections.create({
    name: tr3(`VHOME Kol ${stamp}`, `VHOME Kol FR ${stamp}`, `VHOME Kol DE ${stamp}`),
    description: tr3('Bayram seçkisi', 'Sélection de fête', 'Festauswahl'),
    productIds: memberIds,
  });
  colWithMembers = await collections.setFeatured(createdCol.id, true);
  const createdEmpty = await collections.create({ name: tr3(`VHOME Bos ${stamp}`, `VHOME Bos FR ${stamp}`, `VHOME Bos DE ${stamp}`) });
  colEmpty = await collections.setFeatured(createdEmpty.id, true);
  colPlain = await collections.create({
    name: tr3(`VHOME Isaretsiz ${stamp}`, `VHOME Isaretsiz FR ${stamp}`, `VHOME Isaretsiz DE ${stamp}`),
    productIds: [p1.id],
  });
  collectionIds.push(colWithMembers.id, colEmpty.id, colPlain.id);

  const recipes = new RecipeService(db);
  // Yayın kısıtı (0038 `recipe_publish_requires_all_locales`): YEDİ metin alanının YEDİSİ de üç
  // dilde dolu olmadan `isActive: true` yazılamaz — `meal` dahil, eksiği kısıt keser.
  const r1 = await recipes.createWithItems({
    name: tr3(`VHOME Tarif ${stamp}`, `VHOME Tarif FR ${stamp}`, `VHOME Tarif DE ${stamp}`),
    description: tr3('Açıklama', 'Description', 'Beschreibung'),
    duration: tr3('45 dk', '45 min', '45 Min.'),
    serves: tr3('3–4 kişilik', '3–4 personnes', '3–4 Personen'),
    meal: tr3('Akşam yemeği', 'Dîner', 'Abendessen'),
    steps: tr3('Aç\nPişir', 'Ouvrir\nCuire', 'Öffnen\nBacken'),
    pantry: tr3('Tuz\nSu\nKarabiber', 'Sel\nEau\nPoivre', 'Salz\nWasser\nPfeffer'),
    isActive: true,
    sortOrder: -1_000_000,
    items: [{ variantId: offerVariantId, qty: 2 }],
  });
  recipeSlug = r1.slug;
  // TASLAK tarif daha da öne çivili: sızarsa listenin BAŞINDA görünür — yokluğu güçlü kanıt olur.
  const r2 = await recipes.createWithItems({
    name: tr3(`VHOME Taslak ${stamp}`, `VHOME Taslak FR ${stamp}`, `VHOME Taslak DE ${stamp}`),
    sortOrder: -2_000_000,
  });
  draftRecipeSlug = r2.slug;
  recipeIds.push(r1.id, r2.id);
});

afterAll(async () => {
  // Silme SIRASI tek yerde (`cleanup.ts`) — dosyada elle silme yok (CLAUDE §4b). Teklifli parti ve
  // fiyat satırları ürün purge'üyle gider; tarif kalemleri tarif CASCADE'iyle.
  await purgeTestData(db, { productIds, categoryIds, collectionIds, recipeIds, warehouseIds });
});

describe('GET /api/v1/home', () => {
  it('oturumsuz 200; gövde SÖZLEŞMENİN kendisiyle doğrulanır (tek kaynak)', async () => {
    const res = await app.request('/api/v1/home?locale=fr');
    expect(res.status).toBe(200);
    const data = await dataOf<Home>(res);
    // Zarfın içi sözleşmeden geçmek zorunda — alan adı kayarsa iddia değil parse söyler.
    expect(() => HomeSchema.parse(data)).not.toThrow();
  });

  it('locale yoksa 400 invalid_locale — sessizce TRye düşülmez', async () => {
    const res = await app.request('/api/v1/home');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_locale' });
  });

  it('bozuk Bearer vitrini KAPATMAZ — ziyaretçi olarak 200 (katalogla aynı karar)', async () => {
    const res = await app.request('/api/v1/home?locale=fr', { headers: { authorization: 'Bearer bu-bir-token-degil' } });
    expect(res.status).toBe(200);
  });

  it('bant DEĞİŞMEZLERİ: işaretsiz/boş kaynak hiçbir seçimde giremez, sayaç asla 0 taşımaz', async () => {
    const { bands } = await dataOf<Home>(await app.request('/api/v1/home?locale=fr'));

    const slugs = bands.map((b) => b.slug);
    // Kural işaretlilerden seçer: işaretsiz kategori/koleksiyon HİÇBİR rastgele seçimde giremez.
    expect(slugs).not.toContain(catPlain.slug);
    expect(slugs).not.toContain(colPlain.slug);
    // Üyesiz koleksiyon işaretli olsa da giremez — boş katalog açan kapı taşınmaz.
    expect(slugs).not.toContain(colEmpty.slug);

    for (const band of bands) expect(band.productCount).toBeGreaterThan(0);
    expect(bands.filter((b) => b.kind === 'collection').length).toBeLessThanOrEqual(2);
    expect(bands.length).toBeLessThanOrEqual(6);
  });

  it('FIRSATLAR: açık teklifli parti VARKEN bile dizi boş — yer bilinmezken indirim gösterilmez sözü', async () => {
    // Karar `catalog.ts` UNKNOWN_PLACE künyesinde: teklif partiye, parti depoya bağlı; yeri
    // bilinmeyen ziyaretçiye indirimli fiyat gösterip ödemede yükseltmek verilmiş sözü bozmaktır.
    // `wasCents` yer çözülmeden HİÇBİR ürün için doğamaz → dizi küresel olarak boştur; başka bir
    // ajanın verisi bu iddiayı oynatamaz. Yer çözümü terfi edince (21.6 B) bu test bilinçle kırılır
    // ve pozitif eşiyle değiştirilir.
    const { offers } = await dataOf<Home>(await app.request('/api/v1/home?locale=fr'));
    expect(offers).toEqual([]);
  });

  it('TARİFLER: yayındaki tarif seçili dilde, rozet serbest METİN, sayılar satırdan; taslak sızmaz', async () => {
    const { recipes } = await dataOf<Home>(await app.request('/api/v1/home?locale=fr'));

    // `sortOrder: -1_000_000` tarifi listenin başına çiviler (kurulum notu) — şerit 3 kartlık,
    // "var mı" diye aramak yetmez, BAŞTA olması sıralamanın kanıtıdır.
    const card = recipes[0];
    expect(card?.slug).toBe(recipeSlug);
    expect(card?.name).toBe(`VHOME Tarif FR ${stamp}`);
    // Rozet parçaları veri modelindeki gibi SERBEST METİN — sayı türetilmez (05.16).
    expect(card?.duration).toBe('45 min');
    expect(card?.serves).toBe('3–4 personnes');
    // Kalem SATIR sayısıdır (qty 2 olsa da 1 satır); pantry "satır = madde".
    expect(card?.itemCount).toBe(1);
    expect(card?.pantryCount).toBe(3);
    expect(card?.image.url).toBeNull();
    expect(card?.image.crop).toEqual({ x: 50, y: 50, zoom: 100 });

    // Taslak, öne çivili olduğu hâlde YOK — `isActive` süzgeci sıradan önce geliyor.
    expect(recipes.map((r) => r.slug)).not.toContain(draftRecipeSlug);
  });
});

describe('composeHomeBands — kendi havuzumuzla deterministik kompozisyon', () => {
  it('altyazı tagline/description, sayaç KATALOĞUN ölçütü (aktif), boş koleksiyon düşer, karışım tohuma sadık', async () => {
    const pools = {
      categories: [catFeatured, catPlain],
      collections: [
        { ...colWithMembers, productIds: memberIds },
        { ...colEmpty, productIds: [] },
        { ...colPlain, productIds: [memberIds[0] ?? ''] },
      ],
    };

    // rng=0: işaretli iki koleksiyon (dolu + boş) seçilir, boş olan SAYIMDA düşer; kalan koleksiyon
    // 0. konuma yerleşir → beklenen dizi [koleksiyon, kategori]. Tohum sabit, iddia tam sıra.
    const bands = await composeHomeBands(db, 'fr', pools, () => 0);
    expect(bands.map((b) => [b.kind, b.slug])).toEqual([
      ['collection', colWithMembers.slug],
      ['category', catFeatured.slug],
    ]);

    const [collectionBand, categoryBand] = bands;
    // Kategori kartı: altyazı `tagline`dan (05.17), sayaç 2 — pasif üçüncü ürün SAYILMAZ (kart
    // kataloğun göstereceğinden fazlasını söyleyemez).
    expect(categoryBand?.name).toBe(`VHOME Cat FR ${stamp}`);
    expect(categoryBand?.subtitle).toBe('Fait main');
    expect(categoryBand?.productCount).toBe(2);
    // Koleksiyon kartı: altyazı `description`dan, sayaç aktif ÜYE sayısı.
    expect(collectionBand?.subtitle).toBe('Sélection de fête');
    expect(collectionBand?.productCount).toBe(2);
    expect(collectionBand?.image.crop).toEqual({ x: 50, y: 50, zoom: 100 });
  });

  it('altyazısı olmayan kaynak `null` taşır — yedek metin uydurulmaz', async () => {
    const pools = {
      // İşaretsiz kategoriye işaret vermeden havuzda İŞARETLİ kopyasını kurarız: kural saf veriye
      // bakar, satırın DBdeki hâline değil — kompozisyonun test edilebilir olmasının kendisi bu.
      categories: [{ ...catPlain, isFeatured: true }],
      collections: [],
    };
    const bands = await composeHomeBands(db, 'fr', pools, () => 0);
    // catPlain'in ürünleri: boylu AKTİF ürün (teklif zemini) → sayaç 1..n, altyazı null.
    expect(bands[0]?.subtitle).toBeNull();
    expect(bands[0]?.kind).toBe('category');
  });

  it('hiç işaret yoksa bant listesi BOŞ döner — web yedeğine düşülmediğinin uç kanıtı', async () => {
    const bands = await composeHomeBands(db, 'fr', { categories: [catPlain], collections: [] }, () => 0);
    expect(bands).toEqual([]);
  });
});
