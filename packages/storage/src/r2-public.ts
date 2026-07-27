/**
 * Public okuma URL'i — katalog görselleri için (05.11).
 *
 * Katalog görseli GİZLİ DEĞİL: birazdan anonim ziyaretçiye gösterilecek şeyin ta kendisi. Bu yüzden
 * okuma imzalı (signed) URL ile yapılmaz; imza her render'da değiştiği için tarayıcı/CDN cache'i
 * ölür, paylaşım (OG) kartı imza süresi geçince görselsiz kalır, `next/image` ve Google Görseller
 * devreye giremez. Çözüm: bucket public + anahtardan URL'i SAF STRING BİRLEŞTİRME ile kurmak —
 * async çağrı, S3 istemcisi ve `Promise.all` katmanı gerekmez.
 *
 * Bu dosya bilinçli olarak `r2.service.ts`'ten AYRI: URL çözümü kimlik bilgisi istemez, yalnız
 * `R2_PUBLIC_BASE_URL` + prefix bilir. Böylece okuma yolu yazma yolunun kurulumuna bağlı kalmaz.
 */
import { resolvePrefixedKey } from './r2-key-prefix';

/**
 * Depo anahtarını public okunabilir URL'e çevirir. `null` döner: anahtar yoksa **ya da** taban adres
 * ayarlı değilse (graceful degradation — R2'siz yerelde ekran görselsiz çalışır, çökmez).
 *
 * `version` = görsel dosyasının son değişme anı (`image_updated_at`). Anahtar deterministik olduğu
 * için (aynı slug → aynı obje) dosya değişse de URL aynı kalır; yükleme `immutable, max-age=1y`
 * yazdığından damga olmadan CDN bir yıl eskiyi servis eder. Damga varsa `?v=<epoch>` eklenir.
 *
 * Taban adres bugün Cloudflare **Public Development URL** (`https://pub-xxxx.r2.dev`) — alan adı
 * gelince `cdn.<domain>`'e geçilir, YALNIZ env değeri değişir (kod değişmez).
 */
export function publicImageUrl(key: string | null | undefined, version?: string | null): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (!key || !base) return null;

  const url = `${base}/${resolvePrefixedKey(key)}`;
  if (!version) return url;

  const epoch = Date.parse(version);
  return Number.isNaN(epoch) ? url : `${url}?v=${Math.floor(epoch / 1000)}`;
}
