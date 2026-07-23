// Slug üretimi — bağımlılıksız, saf. Dil-bağımsız URL parçası (kategori/ürün/koleksiyon/paket
// hepsi aynı üreticiyi kullanır). İçerik TR/FR/DE olduğundan üç dilin de aksanları sadeleştirilir.

// NFD ile ayrışmayan ya da özel karşılığı olan harfler (Türkçe ı/İ, Almanca ß, Fransızca œ…).
// ö/ü/ğ/ş/ç de burada — locale'den bağımsız kesin sonuç için (JS toLowerCase locale'e duyarlı).
const EXPLICIT: Record<string, string> = {
  ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ç: 'c', Ç: 'c',
  ö: 'o', Ö: 'o', ü: 'u', Ü: 'u', ß: 'ss', œ: 'oe', Œ: 'oe', æ: 'ae', Æ: 'ae',
};

/** Addan dil-bağımsız slug. "Su Böreği" → "su-boregi". Harf/rakam dışı her şey tireye iner. */
export function slugify(input: string): string {
  return [...input]
    .map((ch) => EXPLICIT[ch] ?? ch)
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // birleşik aksan işaretlerini at (é→e, à→a…)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // harf/rakam dışı → tek tire
    .replace(/^-+|-+$/g, ''); // baş/son tireleri kırp
}

/**
 * Benzersiz slug. Taban boştaysa döner; doluysa `-2`, `-3`… ekleyerek boş olanı bulur.
 * `isTaken`, çağıran tarafından sağlanır (servis DB'ye sorar; test bellek kümesi verir).
 * Slug tamamen boşalırsa (ör. yalnız emoji) güvenli taban `x` kullanılır.
 */
export function uniqueSlug(name: string, isTaken: (candidate: string) => boolean): string {
  const base = slugify(name) || 'x';
  if (!isTaken(base)) return base;
  let n = 2;
  let candidate = `${base}-${n}`;
  while (isTaken(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
