/**
 * Prefix çözümü — DB her yerde RELATIVE anahtar tutar (`catalog/products/x.jpeg`), dev/prod
 * izolasyonu için gerçek bucket anahtarına `R2_PATH_PREFIX` eklenir.
 *
 * Kural TEK YERDE: yazma yolu (`R2Service`) ve okuma yolu (`publicImageUrl`) aynı çözümü kullanır.
 * İkisi ayrı yazılsaydı biri prefix'i atlar, yazılan ile okunan anahtar sessizce ayrışırdı.
 */

/** Env varsayılanı — R2 kurulumu 'dev' prefix'iyle gelir (kök `.env.example`). */
const DEFAULT_PREFIX = 'dev';

/** Baştaki/sondaki eğik çizgileri temizler (çift `//` üreten birleştirmeleri önler). */
const trim = (s: string): string => s.replace(/^\/+|\/+$/g, '');

/** `prefix` verilmezse `R2_PATH_PREFIX` (yok ise 'dev') kullanılır; boş string = root. */
export function resolvePrefixedKey(relativeKey: string, prefix?: string): string {
  const p = trim(prefix ?? process.env.R2_PATH_PREFIX ?? DEFAULT_PREFIX);
  const key = trim(relativeKey);
  return p ? `${p}/${key}` : key;
}
