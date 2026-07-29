import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { KeysetCursor, Product } from '@lezzet/types';
import { serviceDb } from '../client';
import { CategoryService } from './category.service';
import { CollectionService } from './collection.service';
import { ProductService } from './product.service';

/**
 * Ürün listesi: SUNUCU-TARAFLI süzme + keyset sayfalama (05.12) — DB üstünde.
 *
 * Bu test özellikle gereklidir: süzgeçler PostgREST filtre DİZESİ olarak kurulur (jsonb `name->>tr`,
 * `ilike` joker `*`, boş dizi `allergens.eq.{}`, keyset `or(...and(...))`). Bu dizeler TypeScript'ten
 * geçer ama yanlışsa yalnız DB reddeder — tip denetimi yakalamaz. Sayfalamanın kaymadığı da
 * (satır atlama/tekrar) ancak gerçek sorguyla görülür.
 *
 * Veri izolasyonu: tablo başka testlerin/seed'in satırlarını taşıyor → tüm doğrulamalar BU testin
 * yarattığı kayıtlar üzerinden yapılır (benzersiz ad damgası + kendi kategorisi).
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

  // Bilinçli çeşitlilik: beyanı TAM olan iki kayıt + her biri TEK bir eksikliği örnekleyen kayıtlar.
  // "Tam" olmak artık ad dilleri + alerjen DEĞİL; içindekiler, besin değerleri ve saklama da gerekiyor
  // (05.10 — ölçüt `missingDeclarations`'ta). Bu yüzden tam kayıtlar dörtlüyü de taşır.
  const DECL = {
    ingredients: { tr: 'Un, su, tuz.', fr: 'Farine, eau, sel.', de: 'Mehl, Wasser, Salz.' },
    storageInstructions: { tr: 'Serin yerde saklayın.', fr: 'Conserver au frais.', de: 'Kühl lagern.' },
    nutrition: { energyKj: 1600, energyKcal: 380, fatG: 18, saturatedFatG: 7, carbohydrateG: 45, sugarsG: 22, proteinG: 6, saltG: 0.3 },
  };
  const seed: Array<{ name: Record<string, string>; extra?: Record<string, unknown> }> = [
    { name: { tr: `${STAMP} tam bir`, fr: `${STAMP} complet un`, de: `${STAMP} voll eins` }, extra: { allergens: ['gluten'], ...DECL } },
    { name: { tr: `${STAMP} tam iki`, fr: `${STAMP} complet deux`, de: `${STAMP} voll zwei` }, extra: { allergens: ['sut'], ...DECL } },
    { name: { tr: `${STAMP} dil eksik` }, extra: { allergens: ['gluten'], ...DECL } }, // fr/de YOK → beyan eksik
    { name: { tr: `${STAMP} alerjen yok`, fr: `${STAMP} sans`, de: `${STAMP} ohne` }, extra: { ...DECL } }, // allergens boş → beyan eksik
    // İçindekiler YOK: yeni ölçütün kendi başına yakalaması gereken durum (diller ve alerjen tam).
    { name: { tr: `${STAMP} icindekiler yok`, fr: `${STAMP} sans compo`, de: `${STAMP} ohne zutaten` }, extra: { allergens: ['soya'], storageInstructions: DECL.storageInstructions, nutrition: DECL.nutrition } },
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
  for (const id of createdProductIds) await products.delete(id).catch(() => {});
  for (const id of createdCollectionIds) await new CollectionService(db).delete(id).catch(() => {});
  for (const id of createdCategoryIds) await categories.delete(id).catch(() => {});
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
    expect(mine(candidate.rows)).toHaveLength(1);
    expect(mine(candidate.rows)[0]?.name.tr).toContain('aday');
    // Durum TEK alan: 8 kaydın 1'i pasif, 1'i aday → 6 satışta kalır (diğer kategorideki dâhil).
    expect(mine(active.rows)).toHaveLength(6);
    expect(mine(active.rows).every((p) => p.status === 'active')).toBe(true);
  });

  it('beyan-eksik süzgeci: dil, alerjen VEYA beyan metinlerinden biri eksikse yakalar', async () => {
    const incomplete = await products.list({ filters: { query: STAMP, onlyIncomplete: true }, limit: 50 });
    const names = mine(incomplete.rows).map((p) => p.name.tr ?? '');
    // Her biri FARKLI bir eksiklikle listeye girer — süzgeç dördünü de görmeli.
    expect(names.some((n) => n.includes('dil eksik'))).toBe(true);
    expect(names.some((n) => n.includes('alerjen yok'))).toBe(true);
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
 * DAR PROJEKSİYONLARIN İMLECİ (09.17 nöbeti).
 *
 * Fiyat ve stok listeleri `getPageAs` ile dar bir şemadan okunuyor ve Zod tanımadığı alanı düşürüyor.
 * Sıralama alanı (`sort_order`) select'ten çıktığında imleç `{ value: undefined }` doğuyor, ikinci
 * sayfa PostgREST'te `invalid input syntax for type integer: "undefined"` ile düşüyor ve çağıran
 * hatayı yuttuğu için liste sessizce birinci sayfada kalıyor — ekranda "Daha fazla yükle" sonsuza
 * kadar duruyor. Tip denetimi bunu göremez (`value` tipi doğru, DEĞERİ yok) ve tek sayfalık veriyle
 * hiç görünmez; o yüzden nöbet burada, gerçek sorguda.
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
    expect(c.candidate).toBe(1);
    // beyanı eksik: "dil eksik", "alerjen yok", "icindekiler yok", "baska kategori" → 4
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
    expect(c.candidate).toBe(1);
    expect(c.total).toBeLessThan(8); // toplam süzgeçten etkilenir
  });

  it('"beyan eksik" süzgeci ile sayacı AYNI kaynaktan (üretilmiş kolon) okur', async () => {
    const c = await products.counts({ query: STAMP, onlyIncomplete: true });
    const page = await products.list({ filters: { query: STAMP, onlyIncomplete: true }, limit: 50 });
    expect(c.total).toBe(page.rows.length);
    expect(c.incomplete).toBe(page.rows.length);
  });
});
