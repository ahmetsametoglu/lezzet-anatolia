import { describe, expect, it } from 'vitest';
import {
  HOME_BAND_CATEGORY_COUNT,
  HOME_BAND_COLLECTION_COUNT,
  interleaveAtRandom,
  pickRandomDistinct,
  selectHomeBandSources,
  type Rng,
} from './home';

/**
 * Bant karışımının SAF kural testleri — DB'siz (seçim `selectHomeBandSources`ta bilerek ayrı
 * duruyor). Rastgelelik parametre olduğu için kanıt deterministik: tohumlu üreteç aynı diziyi
 * verir, iddialar sayı değil DAVRANIŞ üstünedir (kim girer, sıra korunur mu, kaç tane).
 */

/** Tohumlu LCG — testin rastgeleliği tekrarlanabilir olsun (`Rng` künyesinin gerekçesi). */
function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const letters = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

describe('pickRandomDistinct', () => {
  it('havuz sınırdan küçük/eşitse KOPYASI döner — tekrar üretilmez', () => {
    expect(pickRandomDistinct(letters, 6, seededRng(1))).toEqual([...letters]);
    expect(pickRandomDistinct(letters, 99, seededRng(1))).toEqual([...letters]);
    const pool = ['x'];
    const picked = pickRandomDistinct(pool, 5, seededRng(1));
    expect(picked).toEqual(['x']);
    expect(picked).not.toBe(pool); // kopya: çağıranın dizisi sonradan değişse seçim etkilenmez
  });

  it('rng hep 0 ise ilk N gelir — sıra havuzun sırası', () => {
    expect(pickRandomDistinct(letters, 2, () => 0)).toEqual(['a', 'b']);
  });

  it('seçilenler FARKLI ve havuzdaki GÖRECELİ sırayı korur (kuralın yarısı: kendi arası sortOrder)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const picked = pickRandomDistinct(letters, 3, seededRng(seed));
      expect(new Set(picked).size).toBe(3);
      const indices = picked.map((p) => letters.indexOf(p));
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    }
  });

  it('rastgelelik gerçekten bağlı: farklı tohumlar farklı seçimler üretebiliyor', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) results.add(pickRandomDistinct(letters, 2, seededRng(seed)).join(''));
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('interleaveAtRandom', () => {
  it('iki dizinin İÇ sırası korunur, uzunluk toplamdır, kimse düşmez', () => {
    const primary = ['k1', 'k2', 'k3', 'k4'];
    const secondary = ['c1', 'c2'];
    for (let seed = 1; seed <= 25; seed++) {
      const mixed = interleaveAtRandom(primary, secondary, seededRng(seed));
      expect(mixed).toHaveLength(6);
      expect(mixed.filter((x) => x.startsWith('k'))).toEqual(primary);
      expect(mixed.filter((x) => x.startsWith('c'))).toEqual(secondary);
    }
  });

  it('rng hep 0 ise ikincil dizi BAŞA yerleşir (konum seçimi de aynı üreteçten)', () => {
    expect(interleaveAtRandom(['k1', 'k2'], ['c1'], () => 0)).toEqual(['c1', 'k1', 'k2']);
  });

  it('boş taraf öteki tarafın kopyasını verir', () => {
    expect(interleaveAtRandom(['k1', 'k2'], [], seededRng(3))).toEqual(['k1', 'k2']);
    expect(interleaveAtRandom([], ['c1'], seededRng(3))).toEqual(['c1']);
  });

  it('konum gerçekten rastgele: tohuma göre değişebiliyor', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 25; seed++) {
      /* LCG'nin İLK çıktısı ardışık küçük tohumlarda hemen hemen aynıdır (ölçüldü 08.08: 1..25
         tohumların tamamı 0,236–0,245 bandına, yani hep 0. konuma düşüyor ve bu test kendi
         kurgusuyla KIRMIZIYDI). İki ısındırma turu durumları ayrıştırır; iddia üretecin değil
         KARIŞTIRMANIN rastgeleliği olduğundan ısındırma kurguya dahildir. */
      const rng = seededRng(seed);
      rng();
      rng();
      results.add(interleaveAtRandom(['k1', 'k2', 'k3'], ['c1'], rng).join(''));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});

/** Yardımcı — işaret dışındaki alan kuralın umurunda değil, adla izlenir. */
const src = (name: string, isFeatured: boolean) => ({ name, isFeatured });
const names = (rows: readonly { name: string }[]) => rows.map((r) => r.name);

describe('selectHomeBandSources', () => {
  const cats = [src('k1', true), src('k2', false), src('k3', true), src('k4', true), src('k5', true), src('k6', true), src('k7', true)];
  const cols = [src('c1', true), src('c2', false), src('c3', true), src('c4', true)];

  it('yalnız İŞARETLİLER girer; kategori sortOrder sırasıyla 4, koleksiyon rastgele 2', () => {
    const chosen = selectHomeBandSources(cats, cols, seededRng(7));
    expect(chosen.categories).toHaveLength(HOME_BAND_CATEGORY_COUNT);
    expect(chosen.collections).toHaveLength(HOME_BAND_COLLECTION_COUNT);
    // İşaretsizler (k2, c2) hiçbir tohumda giremez; kategori seçimi işaretlilerin İLK 4'ü.
    expect(names(chosen.categories)).toEqual(['k1', 'k3', 'k4', 'k5']);
    expect(names(chosen.collections)).not.toContain('c2');
    // Koleksiyonların kendi arası sırası havuz (sortOrder) sırasıdır.
    const order = names(chosen.collections).map((n) => names(cols).indexOf(n));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('ESNEME: koleksiyon 2den azsa dizi kategorilerle 6ya tamamlanır', () => {
    const oneCol = selectHomeBandSources(cats, [src('c1', true)], seededRng(1));
    expect(names(oneCol.collections)).toEqual(['c1']);
    expect(oneCol.categories).toHaveLength(5); // 6 - 1

    const noCol = selectHomeBandSources(cats, [src('c1', false)], seededRng(1));
    expect(noCol.collections).toEqual([]);
    expect(noCol.categories).toHaveLength(6);
  });

  it('toplam 6yı bulamazsa OLDUĞU KADAR döner — dolgu/uydurma yok', () => {
    const chosen = selectHomeBandSources([src('k1', true)], [src('c1', true)], seededRng(1));
    expect(names(chosen.categories)).toEqual(['k1']);
    expect(names(chosen.collections)).toEqual(['c1']);
  });

  it('hiç işaret yoksa bant da yoktur — web pickFeatured yedeğine BİLEREK düşülmez', () => {
    const chosen = selectHomeBandSources([src('k1', false)], [src('c1', false)], seededRng(1));
    expect(chosen.categories).toEqual([]);
    expect(chosen.collections).toEqual([]);
  });
});
