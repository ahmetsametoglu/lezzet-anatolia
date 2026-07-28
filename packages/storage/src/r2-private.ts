import { getR2Private } from './r2.service';

/**
 * Private kovadan **süreli okuma adresi** — `publicImageUrl`'in ikizi ve zıddı (16.2).
 *
 * Public tarafta adres kalıcıdır ve öyle olmalı (katalog görseli paylaşılır, cache'lenir,
 * Google'a girer). Burada tam tersi istenir: adres kısa ömürlüdür, sunucu onu ancak yetkiyi
 * doğruladıktan sonra üretir ve kopyalanıp bırakılsa bile birkaç dakikada ölür.
 *
 * **Yetki kontrolü BURADA DEĞİL, çağıranda.** Bu işlev "adres üret" der, "kim görebilir" demez —
 * o soruyu talebin sahibini bilen kapı yanıtlar (`lib/ticket/read.ts`). Yetkiyi buraya koymak,
 * her yeni dosya türünde (belge, kanıt) aynı kararı yeniden yazmak olurdu.
 */

/** Varsayılan ömür: bir ekranı açıp fotoğrafı incelemeye yeter, paylaşılan bir bağlantı olmaya yetmez. */
const DEFAULT_TTL_SECONDS = 900;

/**
 * Anahtarı süreli okuma adresine çevirir. `null` döner: anahtar yoksa **ya da** private kova
 * ayarlı değilse — yerelde R2'siz çalışırken ekran fotoğrafsız çizer, çökmez (public yoldaki
 * `publicImageUrl` ile aynı nezaket).
 */
export async function privateReadUrl(key: string | null | undefined, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string | null> {
  if (!key) return null;
  const r2 = getR2Private();
  if (!r2) return null;
  return r2.getSignedReadUrl(key, ttlSeconds);
}

/**
 * Birden çok anahtar — tek turda. Ayrı ayrı `await` edilseydi 5 fotoğraflı bir talep 5 turluk
 * gecikme yerdi; imzalama yerel bir hesap olduğu için hepsi paralel koşabilir.
 */
export async function privateReadUrls(keys: readonly string[], ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string[]> {
  if (keys.length === 0) return [];
  const urls = await Promise.all(keys.map((key) => privateReadUrl(key, ttlSeconds)));
  return urls.filter((url): url is string => url !== null);
}

/**
 * Tarayıcının dosyayı doğrudan R2'ye göndermesi için süreli yükleme adresi (16.2).
 *
 * Fotoğraf sunucumuza hiç uğramaz — telefonda çekilen 4 MB'lık kare ne action gövde sınırını ne de
 * sunucu belleğini meşgul eder. Çağıran, adresi üretmeden ÖNCE dosya türünü ve boyutunu kendi
 * kurallarıyla süzer: imzalı adres bir izindir, izni verecek olan kapıdır.
 */
export async function privateUploadUrl(key: string, contentType: string, ttlSeconds?: number): Promise<string | null> {
  const r2 = getR2Private();
  if (!r2) return null;
  return r2.getSignedUploadUrl(key, contentType, ttlSeconds);
}
