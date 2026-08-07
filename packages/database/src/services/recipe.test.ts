import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { ProductService } from './product.service';
import { RecipeService } from './recipe.service';
import { RecipeItemService } from './recipe-item.service';

/**
 * Tarifler (05.16) — veri modeli.
 *
 * Sınananların hepsi **veride duran kurallar**: ekran unutabilir, veritabanı unutmaz. En değerlisi
 * üç-dil yayın kısıtı; o düşerse eksik dilli bir tarif yayına çıkar ve Fransız müşteriye Türkçe
 * hazırlanış adımı gider — anlaşılmayan bir adım işe yaramaz, yanlış uygulanırsa yemeği bozar.
 */
const db = serviceDb();
const recipes = new RecipeService(db);
const items = new RecipeItemService(db);
const stamp = Date.now();

let categoryId: string;
let productId: string;
let variantId: string;
let otherVariantId: string;
const createdRecipes: string[] = [];

/** Üç dili de dolu bir metin — yayın kısıtının beklediği hâl. */
const uc = (t: string) => ({ tr: t, fr: `${t} FR`, de: `${t} DE` });

/** Yayına hazır tarif alanları; testler tek tek bozarak kısıtı sınıyor. */
const yayinaHazir = () => ({
  name: uc(`Mercimek ${stamp}`),
  description: uc('Ev usulü'),
  duration: uc('35 dk'),
  serves: uc('3–4 kişilik'),
  meal: uc('Akşam yemeği'),
  steps: uc('Soğanı kavur'),
  pantry: uc('Tuz'),
});

async function tarifAc(over: Record<string, unknown> = {}) {
  const r = await recipes.createWithItems({ name: uc(`Tarif ${stamp}`), ...over });
  createdRecipes.push(r.id);
  return r;
}

beforeAll(async () => {
  const category = await new CategoryService(db).create({ name: { tr: `Tarif testi ${stamp}` } });
  categoryId = category.id;
  const created = await new ProductService(db).create({
    name: { tr: `Mercimek ${stamp}` },
    categoryId,
    variants: [{ label: { tr: '1 kg' } }, { label: { tr: '500 g' } }],
  });
  productId = created.product.id;
  variantId = created.variants[0]!.id;
  otherVariantId = created.variants[1]!.id;
});

afterAll(async () => {
  // Tarif ÜRÜNDEN ÖNCE gider — sıra `cleanup.ts`'te, burada uydurulmuyor (CLAUDE §4b).
  await purgeTestData(db, { recipeIds: createdRecipes, productIds: [productId], categoryIds: [categoryId] });
});

describe('üç dil dolmadan yayın yok — kural VERİDE', () => {
  it('taslak TEK dille açılabilir', async () => {
    // Varsayılan `is_active = false` bir tercih değil zorunluluk: `true` olsaydı tek dille açılan
    // her tarif kısıtta patlar, operatör tarifi hiç oluşturamazdı.
    const r = await tarifAc();
    expect(r.isActive).toBe(false);
    expect(r.slug).toBeTruthy();
  });

  it('eksik dille YAYINLANAMAZ', async () => {
    const r = await tarifAc({ ...yayinaHazir(), steps: { tr: 'yalnız Türkçe' } });
    await expect(recipes.update({ id: r.id, isActive: true })).rejects.toThrow();
  });

  it('BOŞ DİZE dolu sayılmaz', async () => {
    // `? 'fr'` ile yazılmış bir kısıt burada geçerdi: anahtar var ama değer boş. Yayındaki tarifte
    // boş bir hazırlanış adımı, hiç olmayan adımdan kötüdür.
    const r = await tarifAc({ ...yayinaHazir(), pantry: { tr: 'Tuz', fr: '   ', de: 'Salz' } });
    await expect(recipes.update({ id: r.id, isActive: true })).rejects.toThrow();
  });

  it('yedi alanın üçü de dolunca yayınlanır', async () => {
    const r = await tarifAc(yayinaHazir());
    const yayinda = await recipes.update({ id: r.id, isActive: true });
    expect(yayinda.isActive).toBe(true);
  });
});

describe('kalemler', () => {
  it('aynı varyant bir tarifte İKİ KEZ yazılamaz — adet artırmak için qty var', async () => {
    const r = await tarifAc();
    await items.insert({ recipeId: r.id, variantId, qty: 1 });
    await expect(items.insert({ recipeId: r.id, variantId, qty: 1 })).rejects.toThrow();
  });

  it('syncItems ekler, günceller ve listede olmayanı siler', async () => {
    const r = await tarifAc();
    const ilk = await items.syncItems(r.id, [{ variantId, qty: 1 }, { variantId: otherVariantId, qty: 2 }]);
    expect(ilk).toHaveLength(2);
    // Sıra liste sırasından yazılır — müşterinin malzeme listesinde gördüğü sıra budur.
    expect(ilk.map((i) => i.sortOrder)).toEqual([0, 1]);

    const sonra = await items.syncItems(r.id, [{ id: ilk[1]!.id, variantId: otherVariantId, qty: 5 }]);
    expect(sonra).toHaveLength(1);
    expect(sonra[0]!.qty).toBe(5);
    expect(await items.listByRecipe(r.id)).toHaveLength(1);
  });

  it('kalemsiz güncelleme malzemeleri SİLMEZ', async () => {
    // Yalnız sırayı ya da yayın durumunu değiştiren çağrı malzemeleri düşürmemeli.
    const r = await tarifAc();
    await items.syncItems(r.id, [{ variantId, qty: 1 }]);
    const guncel = await recipes.updateWithItems({ id: r.id, sortOrder: 3 });
    expect(guncel.items).toHaveLength(1);
  });

  it('tarif silinince kalemleri de gider (cascade)', async () => {
    const r = await tarifAc();
    await items.syncItems(r.id, [{ variantId, qty: 1 }]);
    await recipes.delete(r.id);
    createdRecipes.splice(createdRecipes.indexOf(r.id), 1);
    expect(await items.listByRecipe(r.id)).toEqual([]);
  });
});

describe('vitrin okuması', () => {
  it('listActive yalnız YAYINDAKİLERİ verir', async () => {
    const taslak = await tarifAc();
    const yayin = await tarifAc(yayinaHazir());
    await recipes.update({ id: yayin.id, isActive: true });

    // Küresel sayıya bakmıyoruz (CLAUDE §4b) — kendi satırlarımızı arıyoruz.
    const ids = (await recipes.listActive(100)).map((r) => r.id);
    expect(ids).toContain(yayin.id);
    expect(ids).not.toContain(taslak.id);
  });

  it('detay kalemleriyle birlikte tek sorguda gelir', async () => {
    const r = await tarifAc(yayinaHazir());
    await items.syncItems(r.id, [{ variantId, qty: 2 }]);
    const detay = await recipes.findBySlugWithItems(r.slug);
    expect(detay?.items).toHaveLength(1);
    expect(detay?.items[0]!.qty).toBe(2);
  });
});
