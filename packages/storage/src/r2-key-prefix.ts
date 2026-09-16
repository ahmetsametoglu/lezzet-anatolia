/**
 * DB relative anahtar tutar; dev/prod izolasyonu için `R2_PATH_PREFIX` yalnız R2 çağrısında eklenir.
 * Yazma (`R2Service`) ve okuma (`publicImageUrl`) aynı çözümü çağırır: ayrı yazılsalardı biri
 * prefix'i atlar, yazılan ile okunan anahtar sessizce ayrışırdı.
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
