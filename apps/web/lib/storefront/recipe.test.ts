import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CategoryService, PriceService, ProductService, RecipeService, StockService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { getRecipeDetail, listStorefrontRecipes } from './recipe';
import { VISITOR } from './read-viewer';

/**
 * **Tarif okuması** (08.24) — "Sofradan Fikirler"in fiyat ve tükenme kuralları.
 *
 * Bu dosyanın çivilediği şey tek bir cümle: **tükenen malzeme toplamdan düşer.** Tasarımın açık
 * kuralı bu ve tek başına okunduğunda zararsız görünüyor — oysa yanlış yönü sessiz: tükenmiş
 * kalemi toplama katan bir okuma, müşteriye sepete geçtiğinde açıklanamayan bir fark gösterir ve
 * hiçbir yerde hata vermez.
 *
 * İkinci çivi **yayın kapısı**: taslak tarif ne listede ne de doğrudan bağlantıyla açılabilir.
 * Kısıt veritabanında (üç dil dolmadan `is_active` olmaz, 05.16) ama o kısıt yalnız yayına GEÇMEYİ
 * engelliyor; okumanın da aynı kararı vermesi gerekiyor, yoksa yarım çevrilmiş bir tarif
 * paylaşılan bir linkle okunurdu.
 */
const db = serviceDb();
const recipes = new RecipeService(db);
const prices = new PriceService(db);
const stocks = new StockService(db);

const stamp = Date.now();
let categoryId: string;
let warehouseId: string;
const productIds: string[] = [];
const recipeIds: string[] = [];

const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Fiyatlı ve stoklu bir varyant — tarif malzemesi olabilmesi için gereken en az şey. */
async function makeVariant(label: string, priceCents: number) {
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `${label} ${stamp}`, fr: `${label} ${stamp}`, de: `${label} ${stamp}` },
    categoryId,
    status: 'active',
    variants: [{ label: { tr: '350 g' } }],
  });
  productIds.push(product.id);
  const variantId = variants[0]!.id;
  await prices.insert({ variantId, channel: 'b2c', amountCents: priceCents });
  await stocks.insert({ warehouseId, variantId, physicalQty: 10, expiryDate: dayOffset(60), purchasePriceCents: 100 });
  return { productId: product.id, variantId };
}

let peynir: { productId: string; variantId: string };
let tereyagi: { productId: string; variantId: string };
let yayinda: string;
let taslak: string;
let yayindaSlug: string;
let taslakSlug: string;

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db)).id;
  categoryId = (await new CategoryService(db).create({ name: { tr: `Tarif ${stamp}` } })).id;
  peynir = await makeVariant('Peynir', 640);
  tereyagi = await makeVariant('Tereyağı', 360);

  /**
   * **Yayındaki tarifin HER metin alanı üç dilde dolu olmalı** — `recipe_publish_requires_all_locales`
   * yalnız ada değil, açıklama/süre/porsiyon/öğün/adımlar/evden maddelerin tamamına bakıyor (0038).
   * Fikstür bunu bilerek karşılıyor: yayına giremeyen bir tarifle vitrin okuması sınanamaz.
   */
  const uc_dil = (metin: string) => ({ tr: metin, fr: metin, de: metin });
  const acilan = await recipes.createWithItems({
    name: uc_dil(`Mıhlama ${stamp}`),
    description: uc_dil('Karadeniz kahvaltısının yıldızı'),
    duration: uc_dil('15 dk'),
    serves: uc_dil('2 kişilik'),
    meal: uc_dil('Kahvaltı'),
    // Satır = madde; aradaki BOŞ satır bilerek duruyor (operatör nefes bırakabilir).
    steps: uc_dil('Tereyağını eritin.\n\nMısır ununu kavurun.\nPeyniri ekleyin.'),
    pantry: uc_dil('Mısır unu\nTereyağı\nSıcak su'),
    isActive: true,
    items: [
      { variantId: peynir.variantId, qty: 1 },
      { variantId: tereyagi.variantId, qty: 2 },
    ],
  });
  yayinda = acilan.id;
  yayindaSlug = acilan.slug;
  recipeIds.push(yayinda);

  const kapali = await recipes.createWithItems({
    name: uc_dil(`Taslak ${stamp}`),
    isActive: false,
    items: [{ variantId: peynir.variantId, qty: 1 }],
  });
  taslak = kapali.id;
  taslakSlug = kapali.slug;
  recipeIds.push(taslak);
});

beforeEach(async () => {
  // Parti her testte İLK HÂLİNE döner. Yarısını geri koymak, adı geçmeyen bir sebeple boş partiyle
  // koşan testler doğurur (`catalog-sort.test.ts` künyesi — yaşandı).
  for (const v of [peynir, tereyagi]) {
    await db.from('stock').update({ physical_qty: 10, offer_price: null }).eq('variant_id', v.variantId);
  }
});

afterAll(async () => {
  await purgeTestData(db, { recipeIds, productIds, categoryIds: [categoryId], warehouseIds: [warehouseId] });
});

/** Yer BELLİ okuma — tarif fiyatı gerçek bir depodan gelir (`DOMAIN §17`). */
const place = () => ({ warehouseId, shippingWarehouseId: null });
const bizimki = async () => (await listStorefrontRecipes('tr', place(), VISITOR)).find((r) => r.id === yayinda);

describe('tarif listesi', () => {
  it('yalnız YAYINDAKİLERİ verir — taslak listede yok', async () => {
    const list = await listStorefrontRecipes('tr', place(), VISITOR);
    expect(list.some((r) => r.id === yayinda)).toBe(true);
    expect(list.some((r) => r.id === taslak)).toBe(false);
  });

  it('kart künyesi kalemlerden TÜRER: ürün sayısı, ev malzemesi sayısı, toplam', async () => {
    const card = await bizimki();
    expect(card?.itemCount).toBe(2);
    // "Evinizden" üç madde — metnin satır sayısı.
    expect(card?.pantryCount).toBe(3);
    // 1 × 6,40 € + 2 × 3,60 € = 13,60 €. Adet çarpımı toplamda sayılır.
    expect(card?.totalCents).toBe(640 + 2 * 360);
    expect(card?.soldOut).toBe(false);
  });
});

describe('tükenen malzeme', () => {
  it('TOPLAMDAN DÜŞER — kalan ürünlerle hesaplanır', async () => {
    // Tereyağı biter: toplam yalnız peynirle kalmalı.
    await db.from('stock').update({ physical_qty: 0 }).eq('variant_id', tereyagi.variantId);

    const card = await bizimki();
    expect(card?.totalCents).toBe(640);
    // Kalem SAYISI düşmez: tarif iki malzemeyle anlatılıyor, biri alınamıyor olsa da.
    expect(card?.itemCount).toBe(2);
    expect(card?.soldOut).toBe(false);
  });

  it('satır listede KALIR ve tükenmiş işaretlenir — sessizce silinmez', async () => {
    await db.from('stock').update({ physical_qty: 0 }).eq('variant_id', tereyagi.variantId);

    const detail = await getRecipeDetail(yayindaSlug, 'tr', place(), VISITOR);
    const satir = detail?.items.find((i) => i.variantId === tereyagi.variantId);
    expect(satir).toBeDefined();
    expect(satir?.soldOut).toBe(true);
    // Fiyatı yine okunur: müşteri neyin tükendiğini ve neye mal olacağını görebilmeli.
    expect(satir?.unitPriceCents).toBe(360);
  });

  it('HEPSİ tükendiyse toplam YOK ve tarif alınamaz — 0,00 € yazılmaz', async () => {
    for (const v of [peynir, tereyagi]) {
      await db.from('stock').update({ physical_qty: 0 }).eq('variant_id', v.variantId);
    }

    const card = await bizimki();
    // Sıfır DEĞİL null: ölçülemeyen değer sıfır değildir, tarif bedava görünürdü (`CLAUDE §1`).
    expect(card?.totalCents).toBeNull();
    expect(card?.soldOut).toBe(true);
  });
});

describe('tarif detayı', () => {
  it('metin alanları MADDEYE bölünür — boş satır atılır, numarayı ekran verir', async () => {
    const detail = await getRecipeDetail(yayindaSlug, 'tr', place(), VISITOR);
    // Üç adım: aradaki boş satır adım sayılmadı.
    expect(detail?.steps).toEqual(['Tereyağını eritin.', 'Mısır ununu kavurun.', 'Peyniri ekleyin.']);
    expect(detail?.pantry).toEqual(['Mısır unu', 'Tereyağı', 'Sıcak su']);
  });

  it('kalemler ürüne bağlanır: ad, boy, adet ve satır toplamı', async () => {
    const detail = await getRecipeDetail(yayindaSlug, 'tr', place(), VISITOR);
    const satir = detail?.items.find((i) => i.variantId === tereyagi.variantId);
    expect(satir?.name).toContain('Tereyağı');
    expect(satir?.unitLabel).toBe('350 g');
    expect(satir?.qty).toBe(2);
    expect(satir?.lineTotalCents).toBe(720);
    expect(satir?.productSlug).not.toBe('');
  });

  it('TASLAK tarif doğrudan bağlantıyla da açılmaz — yayın kapısı okumada da geçerli', async () => {
    expect(await getRecipeDetail(taslakSlug, 'tr', place(), VISITOR)).toBeNull();
  });

  it('olmayan slug null döner (sayfa 404 çevirir)', async () => {
    expect(await getRecipeDetail(`yok-${stamp}`, 'tr', place(), VISITOR)).toBeNull();
  });
});
