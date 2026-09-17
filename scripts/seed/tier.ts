/**
 * Besleme katmanları — `base` yalnız gerçek veriyi yazar ve uzak hedefe yalnız o geçer (kapı `seed.ts`'te, `SEED_ALLOW_REMOTE`), `extend` kusur ve bir miktar geçmiş ekler, `full` her senaryodan bir örnek kurar.
 * Katman bir koşunun kimliğidir: bölümler dolu tabloyu atladığı ve kusurlar ürün yazılırken verildiği için katman değiştirmek `db:refresh` ister.
 */

export const KATMANLAR = ['base', 'extend', 'full'] as const;
export type Katman = (typeof KATMANLAR)[number];

/** Birikim sırası — `enAz` bunun üzerinde çalışır. */
const SIRA: Record<Katman, number> = { base: 0, extend: 1, full: 2 };

/** Bu koşu en az verilen katman kadar dolu mu? (`enAz(k, 'extend')` → extend ve full'de doğru.) */
export function enAz(katman: Katman, esik: Katman): boolean {
  return SIRA[katman] >= SIRA[esik];
}

/** Katmanı komut satırından ya da ortamdan okur; varsayılan `full`, çünkü katmanı bilmeden `db:refresh` koşan bir çalışma yarım veriye düşmemeli. */
export function katmanOku(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Katman {
  const bayrak = argv.find((a) => a.startsWith('--tier='))?.slice('--tier='.length);
  const ham = (bayrak ?? env.SEED_TIER ?? 'full').trim().toLowerCase();
  const bulunan = KATMANLAR.find((k) => k === ham);
  if (!bulunan) throw new Error(`Bilinmeyen besleme katmanı: "${ham}". Geçerli: ${KATMANLAR.join(' · ')}`);
  return bulunan;
}

/**
 * Bu koşu uzak bir veritabanına mı yazıyor — türetilmiş veri (beyan · fiyat · stok) orada yazılmaz.
 * Ölçüt `assertLocalDatabase` ile aynı (`SEED_ALLOW_REMOTE`); iki ayrı ölçüt bir gün ayrışır ve kapı açık kalırdı.
 */
export function uzakHedefMi(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SEED_ALLOW_REMOTE === 'true';
}
