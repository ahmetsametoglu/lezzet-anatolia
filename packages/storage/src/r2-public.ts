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
  const base = publicBase();
  if (!key || !base) return null;
  return withVersion(`${base}/${resolvePrefixedKey(key)}`, version);
}

function publicBase(): string | null {
  return process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, '') || null;
}

function withVersion(url: string, version?: string | null): string {
  if (!version) return url;
  const epoch = Date.parse(version);
  return Number.isNaN(epoch) ? url : `${url}?v=${Math.floor(epoch / 1000)}`;
}

/** Cloudflare dönüşümünün desteklediği çıktı biçimleri — Meta görsel mesajı için `jpeg`. */
export type CdnImageFormat = 'auto' | 'jpeg' | 'png' | 'webp' | 'avif' | 'json';

export interface CdnImageOptions {
  /** En fazla genişlik (px); kaynak küçükse büyütülmez (`fit=scale-down`). */
  width?: number;
  /** En fazla yükseklik (px). */
  height?: number;
  format?: CdnImageFormat;
  /** 1–100; boşsa Cloudflare varsayılanı. */
  quality?: number;
  /**
   * Dört kenardan kesilecek KESİR (0–1), üst·sağ·alt·sol — `cropTrim`in ürettiği kadraj (05.37).
   * Cloudflare kesimi ölçeklemeden ÖNCE uygular; dört sıfır ise parametre hiç yazılmaz.
   */
  trim?: { top: number; right: number; bottom: number; left: number } | null;
}

/**
 * **DÖNÜŞÜMLÜ okuma URL'i** (05.37 · 09.09) — aynı kaynak dosyadan istenen ölçü ve biçim, Cloudflare
 * Image Transformations ile: `<kök>/cdn-cgi/image/<seçenekler>/<anahtar>`.
 *
 * Dönüşüm yalnız Cloudflare'in yönettiği bir zone'da çalışır; kovanın `pub-….r2.dev` geliştirme
 * adresinde YOK (ölçüldü 27.08: parametre yok sayılıyor, `cdn-cgi` yolu 404). Taban o adresse
 * `null` döner ve çağıran özgün adrese düşer — `null`, "dönüştürülemez"in adıdır, sıfır değil.
 * Ölçüldü 09.09 (`cdn.lezzetanatolie.com`): `width=200,format=jpeg` → 200 `image/jpeg` 3,4 KB;
 * `width=1200` → 67 KB (kaynak 1500² WebP 70 KB).
 *
 * Sürüm damgası dönüşümlü adrese de girer: kaynak değişince adres değişir, önbellek eskiyi tutamaz.
 * Kadraj (odak + zoom → `trim`) bu fonksiyona SONRA eklenir (05.37'nin formülü `packages/types`e
 * yazılınca); bugün yalnız ölçü ve biçim.
 */
export function cdnImageUrl(key: string | null | undefined, version: string | null | undefined, options: CdnImageOptions): string | null {
  const base = publicBase();
  if (!key || !base || /\.r2\.dev$/i.test(new URL(base).hostname)) return null;

  const t = options.trim;
  const kesim = t && (t.top || t.right || t.bottom || t.left) ? `trim=${[t.top, t.right, t.bottom, t.left].map((v) => Math.min(Math.max(v, 0), 0.99)).join(';')}` : null;
  const parts = [
    kesim,
    options.width ? `width=${Math.round(options.width)}` : null,
    options.height ? `height=${Math.round(options.height)}` : null,
    'fit=scale-down',
    options.format ? `format=${options.format}` : null,
    options.quality ? `quality=${Math.round(options.quality)}` : null,
  ].filter(Boolean);
  return withVersion(`${base}/cdn-cgi/image/${parts.join(',')}/${resolvePrefixedKey(key)}`, version);
}
