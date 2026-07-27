import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Product } from '@lezzet/types';
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

  // Bilinçli çeşitlilik: üç dili tam + alerjenli (beyanı TAM), tek dilli (dil eksik), alerjensiz,
  // pasif, aday. Süzgeçlerin her biri farklı bir satırı hedefliyor.
  const seed: Array<{ name: Record<string, string>; extra?: Record<string, unknown> }> = [
    { name: { tr: `${STAMP} tam bir`, fr: `${STAMP} complet un`, de: `${STAMP} voll eins` }, extra: { allergens: ['gluten'] } },
    { name: { tr: `${STAMP} tam iki`, fr: `${STAMP} complet deux`, de: `${STAMP} voll zwei` }, extra: { allergens: ['sut'] } },
    { name: { tr: `${STAMP} dil eksik` }, extra: { allergens: ['gluten'] } }, // fr/de YOK → beyan eksik
    { name: { tr: `${STAMP} alerjen yok`, fr: `${STAMP} sans`, de: `${STAMP} ohne` } }, // allergens boş → beyan eksik
    { name: { tr: `${STAMP} pasif`, fr: `${STAMP} passif`, de: `${STAMP} passiv` }, extra: { allergens: ['soya'], isActive: false } },
    { name: { tr: `${STAMP} aday`, fr: `${STAMP} candidat`, de: `${STAMP} kandidat` }, extra: { allergens: ['susam'], isCandidate: true } },
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
    expect(mine(inCat.rows)).toHaveLength(6);
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
    // Aktif = aday DEĞİL + is_active: 7 kaydın 1'i pasif, 1'i aday, 1'i diğer kategoride → 5 kalır.
    expect(mine(active.rows)).toHaveLength(5);
    expect(mine(active.rows).every((p) => p.isActive && !p.isCandidate)).toBe(true);
  });

  it('beyan-eksik süzgeci: dili eksik VEYA alerjeni boş olanlar', async () => {
    const incomplete = await products.list({ filters: { query: STAMP, onlyIncomplete: true }, limit: 50 });
    const names = mine(incomplete.rows).map((p) => p.name.tr ?? '');
    // "dil eksik" (fr/de yok) + "alerjen yok" (boş dizi) + "baska kategori" (fr/de ve alerjen yok)
    expect(names.some((n) => n.includes('dil eksik'))).toBe(true);
    expect(names.some((n) => n.includes('alerjen yok'))).toBe(true);
    // Üç dili tam VE alerjenli olanlar listede OLMAMALI.
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

    // Bu testin 7 kaydı; tekrar YOK (Set boyutu = uzunluk) ve hepsi geldi.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(7);
  });

  it('son sayfada nextCursor null döner', async () => {
    const page = await products.list({ filters: { query: STAMP }, limit: 50 });
    expect(page.nextCursor).toBeNull();
  });
});

describe('ProductService.listWithRelations — N+1 kırma', () => {
  it('varyantlar ve koleksiyon üyelikleri TEK sorguda gelir', async () => {
    const page = await products.listWithRelations({ filters: { query: STAMP }, limit: 50 });
    const rows = mine(page.rows);
    expect(rows).toHaveLength(7);

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

describe('ProductService.countsByCategory', () => {
  it('kategori başına sayı TEK gruplu sorguda gelir', async () => {
    // PostgREST toplama (`count()` seçimi → örtük group by) sürüme bağlıdır: bu test onu doğrular.
    const byCategory = await products.countsByCategory();
    expect(byCategory.get(categoryId)).toBe(6);
    expect(byCategory.get(otherCategoryId)).toBe(1);
  });
});

describe('ProductService.counts', () => {
  it('sayaçlar listeyle AYNI süzgeci kullanır', async () => {
    const c = await products.counts({ query: STAMP });
    expect(c.total).toBe(7);
    expect(c.candidate).toBe(1);
    // beyanı eksik: "dil eksik", "alerjen yok", "baska kategori" → 3
    expect(c.incomplete).toBe(3);
  });
});
