import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { resolvePrefixedKey } from './r2-key-prefix';

interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Anahtar prefix'i (dev/prod izolasyonu). Boş = root. */
  pathPrefix?: string;
}

/**
 * Cloudflare R2 (S3-uyumlu) dosya deposu — referans proje (petitcigogne) R2Service deseni. Supabase
 * Storage YERİNE R2 kullanılır. DB her yerde RELATIVE key tutar; prefix (dev/prod izolasyonu) yalnız
 * R2 çağrısında uygulanır.
 *
 * Bu sınıf YALNIZ YAZMA yoludur (kimlik bilgisi ister). Okuma, public bucket üzerinden saf string
 * birleştirmeyle çözülür → `publicImageUrl` (05.11). İmzalı okuma bilinçli olarak SİLİNDİ: katalog
 * görseli gizli değil, imza cache'i ve paylaşım kartını kırıyordu. Gerçekten özel dosyalar
 * (teslim onayı fotoğrafı, şikayet eki, fatura) geldiğinde ikinci bir PRIVATE bucket'la döner —
 * o zaman ihtiyaç duyulan yetenek o modülde eklenir (paket artımlı büyür).
 */
// Dışa yalnız getR2() verilir; R2Service tipi ihtiyaç doğunca export edilir (artımlı).
class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  // Ham değer saklanır; varsayılan ve temizlik `resolvePrefixedKey`'de — okuma yolu da aynı işlevi
  // çağırır, böylece "boş string = kök mü, dev mi" gibi ayrışmalar doğmaz.
  private readonly prefix: string | undefined;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
    this.prefix = config.pathPrefix;
  }

  // Relative key → bucket içi gerçek key. Çözüm okuma yoluyla PAYLAŞILIR (r2-key-prefix).
  private resolveKey(relativeKey: string): string {
    return resolvePrefixedKey(relativeKey, this.prefix);
  }

  /**
   * Nesneyi yükler. Anahtar deterministik (slug'a bağlı) → aynı görsel yenilenince ÜZERİNE yazılır,
   * yetim obje kalmaz. `immutable` uzun cache buna rağmen güvenlidir: okuma URL'i `?v=<damga>` ile
   * sürümlenir (`publicImageUrl`), dosya değişince adres değişir.
   */
  async uploadFile(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.resolveKey(key),
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  /** Nesneyi siler. */
  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }));
  }
}

// ─── Env'den lazy singleton ──────────────────────────────

let cached: R2Service | null | undefined;

/**
 * Env değişkenlerinden R2Service üretir; eksikse `null` (graceful degradation — local'de R2 ayarsızsa
 * upload skip + görselsiz devam). Env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME, R2_PATH_PREFIX (opsiyonel; varsayılan 'dev').
 */
export function getR2(): R2Service | null {
  if (cached !== undefined) return cached;

  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    cached = null;
    return null;
  }

  // Prefix HAM geçilir: varsayılanı (`dev`) `resolvePrefixedKey` uygular. Burada `|| 'dev'` yazmak
  // okuma yolundan ayrışırdı (orada boş string = kök) → aynı anahtar iki farklı yere düşerdi.
  cached = new R2Service({ endpoint, accessKeyId, secretAccessKey, bucket, pathPrefix: process.env.R2_PATH_PREFIX });
  return cached;
}
