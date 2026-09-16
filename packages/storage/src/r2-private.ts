import { getR2Private } from './r2.service';

/**
 * Public adres kalıcıdır ve öyle olmalı; burada tam tersi istenir — adres kısa ömürlüdür, kopyalanıp
 * bırakılsa bile birkaç dakikada ölür. **Yetki kontrolü BURADA DEĞİL, çağıranda:** bu işlev "adres
 * üret" der, "kim görebilir" demez; yetkiyi buraya koymak her yeni dosya türünde aynı kararı yeniden
 * yazmak olurdu.
 */

/**
 * `null` döner: anahtar yoksa **ya da** private kova ayarlı değilse — R2'siz yerelde ekran
 * fotoğrafsız çizer, çökmez. Süre verilmezse imzayı üreten servisin varsayılanı geçerlidir.
 */
export async function privateReadUrl(key: string | null | undefined, ttlSeconds?: number): Promise<string | null> {
  if (!key) return null;
  const r2 = getR2Private();
  if (!r2) return null;
  return r2.getSignedReadUrl(key, ttlSeconds);
}

/**
 * Birden çok anahtar — tek turda. Ayrı ayrı `await` edilseydi 5 fotoğraflı bir talep 5 turluk
 * gecikme yerdi; imzalama yerel bir hesap olduğu için hepsi paralel koşabilir.
 */
export async function privateReadUrls(keys: readonly string[], ttlSeconds?: number): Promise<string[]> {
  if (keys.length === 0) return [];
  const urls = await Promise.all(keys.map((key) => privateReadUrl(key, ttlSeconds)));
  return urls.filter((url): url is string => url !== null);
}

/**
 * Fotoğraf sunucumuza hiç uğramaz: telefonda çekilen 4 MB'lık kare ne action gövde sınırını ne de
 * sunucu belleğini meşgul eder. Çağıran dosya türünü ve boyutunu adres üretilmeden ÖNCE süzer —
 * imzalı adres bir izindir, izni verecek olan kapıdır.
 */
export async function privateUploadUrl(key: string, contentType: string, ttlSeconds?: number): Promise<string | null> {
  const r2 = getR2Private();
  if (!r2) return null;
  return r2.getSignedUploadUrl(key, contentType, ttlSeconds);
}
