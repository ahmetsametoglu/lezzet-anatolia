import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KeysetCursor, Product } from '@lezzet/types';
import { serviceDb } from '../client';
import { purgeTestData } from '../testing/cleanup';
import { CategoryService } from './category.service';
import { CollectionService } from './collection.service';
import { ProductService } from './product.service';

/**
 * Ürün listesi: sunucu tarafında süzme + keyset sayfalama, DB üstünde — süzgeçler PostgREST filtre dizesi olarak kurulur ve
 * yanlışsa yalnız DB reddeder; sayfalamanın kaymadığı da ancak gerçek sorguda görülür. Doğrulamalar yalnız bu testin kayıtlarına
 * bakar (damgalı ad + kendi kategorisi).
 */
const db = serviceDb();
const products = new ProductService(db);
const categories = new CategoryService(db);

const STAMP = `L${Date.now()}`; // bu koşuya özgü damga — arama süzgeci bununla hedeflenir
let categoryId: string;
let otherCategoryId: string;
const createdProductIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdCollectionIds: string[] = [];

/** Bu testin kayıtlarını damgadan tanır (tablodaki yabancı satırlar sonuçları kirletmesin). */
const mine = <T extends Pick<Product, 'slug'>>(rows: T[]): T[] => rows.filter((p) => p.slug.includes(STAMP.toLowerCase()));

beforeAll(async () => {
  const cat = await categories.create({ name: { tr: `Kategori ${STAMP}` } });
  const other = await categories.create({ name: { tr: `Diger ${STAMP}` } });
  categoryId = cat.id;
  otherCategoryId = other.id;
  createdCategoryIds.push(cat.id, other.id);

  // Bilinçli çeşitlilik: beyanı tam iki kayıt + her biri tek bir eksikliği örnekleyen kayıtlar; "tam" dil, içindekiler, besin,
  // saklama ve alerjen demektir (`missingDeclarations`).
  // Durum açıkça yazılır ve `description` DECL'de, çünkü aktif satır yayın kısıtını karşılamalı; eksik künyeli satırlar aday kalır
  // ve `is_incomplete` durumdan bağımsız olduğu için "beyan eksik" kovası yaşar.
  const DECL = {
    description: { tr: 'Üç dilde dolu açıklama.', fr: 'Description complète.', de: 'Vollständige Beschreibung.' },
    ingredients: { tr: 'Un, su, tuz.', fr: 'Farine, eau, sel.', de: 'Mehl, Wasser, Salz.' },
    storageInstructions: { tr: 'Serin yerde saklayın.', fr: 'Conserver au frais.', de: 'Kühl lagern.' },
    nutrition: { energyKj: 1600, energyKcal: 380, fatG: 18, saturatedFatG: 7, carbohydrateG: 45, sugarsG: 22, proteinG: 6, saltG: 0.3 },
    // Satıştaki boyun net miktarı zorunlu (tetikleyici, `0005`) — "tam" gövde onu da taşır.
    variants: [{ netQuantity: 500, netUnit: 'g' as const }],
  };
  const seed: Array<{ name: Record<string, string>; extra?: Record<string, unknown> }> = [
    { name: { tr: `${STAMP} tam bir`, fr: `${STAMP} complet un`, de: `${STAMP} voll eins` }, extra: { allergens: ['gluten'], status: 'active', ...DECL } },
    // Boş liste "alerjen içermez" beyanıdır: tam sayılır ve yayına alınabilir.
    { name: { tr: `${STAMP} tam iki`, fr: `${STAMP} complet deux`, de: `${STAMP} voll zwei` }, extra: { allergens: [], status: 'active', ...DECL } },
    // fr/de YOK → beyan eksik. **Aday kalmak ZORUNDA:** adı üç dilde dolu olmayan ürün yayına alınamaz.
    { name: { tr: `${STAMP} dil eksik` }, extra: { allergens: ['gluten'], ...DECL } },
    // Alerjen beyanı girilmedi (`null`) → beyan eksik; metinleri tam olsa da yayın kısıtı onu tutar, aday kalır.
    { name: { tr: `${STAMP} alerjen girilmedi`, fr: `${STAMP} sans`, de: `${STAMP} ohne` }, extra: { ...DECL } },
    // İçindekiler YOK: yeni ölçütün kendi başına yakalaması gereken durum (diller ve alerjen tam).
    // Yasal beyan eksik olduğu için yayın kısıtı da onu tutuyor → aday.
    { name: { tr: `${STAMP} icindekiler yok`, fr: `${STAMP} sans compo`, de: `${STAMP} ohne zutaten` }, extra: { allergens: ['soya'], description: DECL.description, storageInstructions: DECL.storageInstructions, nutrition: DECL.nutrition } },
    { name: { tr: `${STAMP} pasif`, fr: `${STAMP} passif`, de: `${STAMP} passiv` }, extra: { allergens: ['soya'], status: 'passive', ...DECL } },
    { name: { tr: `${STAMP} aday`, fr: `${STAMP} candidat`, de: `${STAMP} kandidat` }, extra: { allergens: ['susam'], status: 'candidate', ...DECL } },
  ];
  for (const s of seed) {
    const { product } = await products.create({ name: s.name, categoryId, ...s.extra });
    createdProductIds.push(product.id);
  }
  // Arama süzgecinin kategoriye göre daraldığını görmek için diğer kategoride bir kayıt.
  const { product: outsider } = await products.create({ name: { tr: `${STAMP} baska kategori` }, categoryId: otherCategoryId });
  createdProductIds.push(outsider.id);
});

afterAll(async () => {
  // Silme susturulmaz, susturulmuş silme teardown'ın yalan söylemesidir.
  // Sıra tek yerde (`cleanup.ts`): koleksiyon bağı ürünle cascade gider, kategori en son.
  await purgeTestData(db, {
    productIds: createdProductIds,
    collectionIds: createdCollectionIds,
    categoryIds: createdCategoryIds,
  });
});

describe('ProductService.list — süzme', () => {
  it('ad araması üç dilde de bulur (jsonb)', async () => {
    const tr = await products.list({ filters: { query: `${STAMP} pasif` }, limit: 50 });
    expect(mine(tr.rows)).toHaveLength(1);

    // FR ve DE metni yalnız o dillerde geçiyor → arama TR'ye bağlı olsaydı bulamazdı.
    const fr = await products.list({ filters: { query: 'candidat' }, limit: 50 });
    expect(mine(fr.rows).some((p) => p.name.tr?.includes('aday'))).toBe(true);

    const de = await products.list({ filters: { query: 'kandidat' }, limit: 50 });
    expect(mine(de.rows).some((p) => p.name.tr?.includes('aday'))).toBe(true);
  });

  it('kategori süzgeci listeyi daraltır', async () => {
    const inCat = await products.list({ filters: { query: STAMP, categoryId }, limit: 50 });
    expect(mine(inCat.rows)).toHaveLength(7);
    expect(mine(inCat.rows).every((p) => p.categoryId === categoryId)).toBe(true);

    const outside = await products.list({ filters: { query: STAMP, categoryId: otherCategoryId }, limit: 50 });
    expect(mine(outside.rows)).toHaveLength(1);
  });

  it('durum süzgeci: aktif / pasif / aday ayrışır', async () => {
    const active = await products.list({ filters: { query: STAMP, status: 'active' }, limit: 50 });
    const passive = await products.list({ filters: { query: STAMP, status: 'passive' }, limit: 50 });
    const candidate = await products.list({ filters: { query: STAMP, status: 'candidate' }, limit: 50 });

    expect(mine(passive.rows)).toHaveLength(1);
    expect(mine(passive.rows)[0]?.name.tr).toContain('pasif');
    // Durum tek alan; 8 kaydın dağılımı 2 aktif · 1 pasif · 5 aday. Adı ya da beyanı eksik ürün yayın kısıtından geçemediği için adaydır.
    expect(mine(candidate.rows).map((p) => p.name.tr ?? '').sort()).toEqual(
      [`${STAMP} aday`, `${STAMP} alerjen girilmedi`, `${STAMP} baska kategori`, `${STAMP} dil eksik`, `${STAMP} icindekiler yok`].sort(),
    );
    expect(mine(active.rows)).toHaveLength(2);
    expect(mine(active.rows).every((p) => p.status === 'active')).toBe(true);
  });

  it('beyan-eksik süzgeci: dil, alerjen VEYA beyan metinlerinden biri eksikse yakalar', async () => {
    const incomplete = await products.list({ filters: { query: STAMP, onlyIncomplete: true }, limit: 50 });
    const names = mine(incomplete.rows).map((p) => p.name.tr ?? '');
    // Her biri FARKLI bir eksiklikle listeye girer — süzgeç dördünü de görmeli.
    expect(names.some((n) => n.includes('dil eksik'))).toBe(true);
    expect(names.some((n) => n.includes('alerjen girilmedi'))).toBe(true);
    expect(names.some((n) => n.includes('icindekiler yok'))).toBe(true);
    expect(names.some((n) => n.includes('baska kategori'))).toBe(true);
    // Beyanı TAM olanlar listede OLMAMALI.
    expect(names.some((n) => n.includes('tam bir'))).toBe(false);
    expect(names.some((n) => n.includes('tam iki'))).toBe(false);
  });
});

describe('ProductService.list — keyset sayfalama', () => {
  it('sayfalar birbirini tekrarlamaz ve atlamaz', async () => {
    const seen: string[] = [];
    let cursor = undefined as Awaited<ReturnType<typeof products.list>>['nextCursor'] | undefined;
    let guard = 0;
    do {
      const page = await products.list({ filters: { query: STAMP }, limit: 2, cursor: cursor ?? undefined });
      expect(page.rows.length).toBeLessThanOrEqual(2);
      seen.push(...mine(page.rows).map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor && ++guard < 20);

    // Bu testin 8 kaydı; tekrar YOK (Set boyutu = uzunluk) ve hepsi geldi.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(8);
  });

  it('son sayfada nextCursor null döner', async () => {
    const page = await products.list({ filters: { query: STAMP }, limit: 50 });
    expect(page.nextCursor).toBeNull();
  });
});

/**
 * Dar projeksiyonların imleci — `getPageAs` Zod'un tanımadığı alanı düşürür; sıralama alanı select'ten çıkarsa imleç değersiz doğar
 * ve ikinci sayfa düşer, çağıran hatayı yutarsa liste sessizce ilk sayfada kalır. Tip denetimi bunu göremez, bu yüzden gerçek sorguda.
 */
describe.each([
  ['listPriceRows', (o: { limit: number; cursor?: KeysetCursor }) => products.listPriceRows({ filters: { query: STAMP }, ...o })],
  ['listStockRows', (o: { limit: number; cursor?: KeysetCursor }) => products.listStockRows({ filters: { query: STAMP }, ...o })],
])('ProductService.%s — dar projeksiyonda keyset', (_ad, read) => {
  it('imleç DEĞER taşır (dar şema düşürse bile)', async () => {
    const page = await read({ limit: 2 });
    expect(page.nextCursor).not.toBeNull();
    expect(page.nextCursor?.value).toBeTypeOf('number');
  });

  it('sayfalar birbirini tekrarlamaz, hepsi gelir ve liste BİTER', async () => {
    const seen: string[] = [];
    let cursor: KeysetCursor | undefined;
    let guard = 0;
    do {
      const page = await read({ limit: 2, cursor });
      seen.push(...page.rows.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && ++guard < 20);

    // Bu testin 8 kaydı: tekrar yok, hepsi geldi ve imleç null'a düştü (sonsuz "Daha fazla" yok).
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(8);
    expect(cursor).toBeUndefined();
  });
});

describe('ProductService.listWithRelations — N+1 kırma', () => {
  it('varyantlar ve koleksiyon üyelikleri TEK sorguda gelir', async () => {
    const page = await products.listWithRelations({ filters: { query: STAMP }, limit: 50 });
    const rows = mine(page.rows);
    expect(rows).toHaveLength(8);

    // Her ürün en az bir varyant taşır (varyantsız üründe varsayılan varyant otomatik açılır, 05.3)
    // ve varyantlar GÖMÜLÜ geldi — ürün başına ayrı sorgu atılmadı.
    expect(rows.every((p) => p.variants.length >= 1)).toBe(true);
    expect(rows.every((p) => p.variants.every((v) => v.productId === p.id))).toBe(true);

    // Üyelik dizisi de gömülü; bu testin ürünleri koleksiyona eklenmedi → boş ama TANIMLI olmalı
    // (alan hiç gelmezse şema doğrulaması patlar; "sessizce boş" ile "yok" ayrımı budur).
    expect(rows.every((p) => Array.isArray(p.collections))).toBe(true);
  });

  it('süzgeç ve sayfalama ilişkili okumada da aynı çalışır', async () => {
    const passive = await products.listWithRelations({ filters: { query: STAMP, status: 'passive' }, limit: 50 });
    expect(mine(passive.rows)).toHaveLength(1);

    const first = await products.listWithRelations({ filters: { query: STAMP }, limit: 3 });
    expect(first.rows).toHaveLength(3);
    expect(first.nextCursor).not.toBeNull();
  });
});

describe('CollectionService.listWithProductIds — N+1 kırma', () => {
  it('üyelik id\'leri gömülü gelir ve vitrin sırasında (position) döner', async () => {
    const collections = new CollectionService(db);
    const created = await collections.create({
      name: { tr: `Koleksiyon ${STAMP}` },
      // Sıra BİLİNÇLİ ters: dizinin sırası position olarak yazılır → okuma o sırayı geri vermeli.
      productIds: [createdProductIds[2]!, createdProductIds[0]!, createdProductIds[1]!],
    });
    createdCollectionIds.push(created.id);

    const rows = await collections.listWithProductIds();
    const row = rows.find((c) => c.id === created.id);
    expect(row).toBeDefined();
    expect(row!.productIds).toEqual([createdProductIds[2], createdProductIds[0], createdProductIds[1]]);
  });
});

describe('ProductService.counts (tek okuma)', () => {
  it('sayaçlar listeyle AYNI süzgeci kullanır', async () => {
    const c = await products.counts({ query: STAMP });
    expect(c.total).toBe(8);
    // Aday: "dil eksik" · "alerjen girilmedi" · "icindekiler yok" · "aday" · "baska kategori" → 5 (künye durum testinde)
    expect(c.candidate).toBe(5);
    // Beyanı eksik: "dil eksik", "alerjen girilmedi", "icindekiler yok", "baska kategori" → 4; `is_incomplete` durumdan
    // bağımsızdır: "aday" beyanı tam olduğu hâlde adaydır.
    expect(c.incomplete).toBe(4);
  });

  it('kategori sayaçları AYNI okumada gelir ve süzgeçten ETKİLENMEZ', async () => {
    // Kategori listesinin kendi sayısıdır: ürün süzgeci daraltsa da kategori "7 ürün" demeye devam
    // etmeli, yoksa arama yapan operatör kategorinin boşaldığını sanır.
    const c = await products.counts({ query: STAMP });
    expect(c.byCategory.get(categoryId)).toBe(7);
    expect(c.byCategory.get(otherCategoryId)).toBe(1);
  });

  it('aday sayacı DURUM süzgecini yok sayar (aday kuyruğu görünmeye devam eder)', async () => {
    const c = await products.counts({ query: STAMP, status: 'active' });
    expect(c.candidate).toBe(5);
    expect(c.total).toBeLessThan(8); // toplam süzgeçten etkilenir
  });

  it('"beyan eksik" süzgeci ile sayacı AYNI kaynaktan (üretilmiş kolon) okur', async () => {
    const c = await products.counts({ query: STAMP, onlyIncomplete: true });
    const page = await products.list({ filters: { query: STAMP, onlyIncomplete: true }, limit: 50 });
    expect(c.total).toBe(page.rows.length);
    expect(c.incomplete).toBe(page.rows.length);
  });
});
