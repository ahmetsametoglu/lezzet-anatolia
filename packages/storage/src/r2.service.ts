import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
 * R2 çağrısında uygulanır. Private bucket → okuma signed URL ile (TTL). Artımlı: şimdilik
 * upload/delete/signed-read; copy/list/data-url/presigned-upload ihtiyaç doğdukça eklenir.
 */
// Dışa yalnız getR2() verilir; R2Service tipi ihtiyaç doğunca export edilir (artımlı).
class R2Service {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
    this.prefix = config.pathPrefix?.replace(/\/+$/, '') ?? '';
  }

  // Relative key → bucket içi gerçek key. Prefix yönetimi yalnız burada; DB relative tutar.
  private resolveKey(relativeKey: string): string {
    const cleaned = relativeKey.replace(/^\/+/, '');
    return this.prefix ? `${this.prefix}/${cleaned}` : cleaned;
  }

  /** Nesneyi yükler. Key'ler timestamp'li (üzerine yazılmaz) → immutable uzun cache. */
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

  /** Geçici okuma URL'i (private bucket; varsayılan 30 dk). */
  async getSignedReadUrl(key: string, expiresInSeconds = 1800): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }), {
      expiresIn: expiresInSeconds,
    });
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

  cached = new R2Service({ endpoint, accessKeyId, secretAccessKey, bucket, pathPrefix: process.env.R2_PATH_PREFIX || 'dev' });
  return cached;
}
