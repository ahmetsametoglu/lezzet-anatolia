/**
 * Katalog görseli GİZLİ DEĞİL, birazdan anonim ziyaretçiye gösterilecek şeyin ta kendisidir: imzalı
 * adres her render'da değişip tarayıcı ve CDN önbelleğini öldürür, paylaşım kartını süre dolunca
 * görselsiz bırakır. Bu dosya `r2.service.ts`'ten bilinçli AYRI — URL çözümü kimlik bilgisi istemez,
 * böylece okuma yolu yazma yolunun kurulumuna bağlı kalmaz.
 */
import { resolvePrefixedKey } from './r2-key-prefix';

/**
 * `null` döner: anahtar yoksa **ya da** taban adres ayarlı değilse — R2'siz yerelde ekran görselsiz
 * çalışır, çökmez. `version` (`image_updated_at`) olmadan CDN eskiyi bir yıl servis eder, çünkü
 * anahtar deterministiktir (aynı slug, aynı obje) ve yükleme `immutable, max-age=1y` yazar.
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
   * Dört kenardan kesilecek KESİR (0–1), üst·sağ·alt·sol — `cropTrim`in ürettiği kadraj. Cloudflare
   * kesimi ölçeklemeden ÖNCE uygular; dört sıfır ise parametre hiç yazılmaz.
   */
  trim?: { top: number; right: number; bottom: number; left: number } | null;
}

/**
 * **DÖNÜŞÜMLÜ okuma adresi** — aynı kaynaktan istenen kadraj, ölçü ve biçim:
 * `<kök>/cdn-cgi/image/<seçenekler>/<anahtar>`. Dönüşüm yalnız Cloudflare'in yönettiği bir zone'da
 * çalışır, kovanın `pub-….r2.dev` geliştirme adresinde YOKTUR — orada `null` döner ve çağıran özgün
 * adrese düşer, çünkü `null` burada "dönüştürülemez"in adıdır, sıfır değil.
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
