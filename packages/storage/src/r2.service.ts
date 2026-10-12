import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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
 * **İKİ KOVA ZORUNLU, tercih değil:** R2'de "herkese açık" ayarı kova düzeyindedir, aynı kovanın
 * içinde "şu klasör gizli" denemez — public kova (`getR2`) katalogundur ve imzasız okunur, private
 * kova (`getR2Private`) müşterinin yüklediği dosyalarındır ve yalnız yetki doğrulandıktan sonra
 * üretilen süreli imzalı adresle okunur.
 */
// Sınıf dışa açılmaz; tipe ihtiyaç doğduğunda export edilir (artımlı).
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
   * Anahtar deterministik olduğu için aynı görsel yenilenince ÜZERİNE yazılır, yetim obje kalmaz.
   * `immutable` uzun önbellek buna rağmen güvenli: okuma adresi `?v=<damga>` ile sürümlenir, dosya
   * değişince adres de değişir.
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

  /**
   * HEAD isteği, gövde inmez; nesne yoksa `null`. Tek parça yüklemede ETag içeriğin MD5'idir, yani
   * dosyanın özetini elinde tutan çağıran "aynısı zaten depoda mı" sorusunu indirmeden cevaplar.
   */
  async fileEtag(key: string): Promise<string | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }));
      return head.ETag?.replace(/"/g, '') ?? null;
    } catch (err) {
      // Yalnız "nesne yok" yutulur: yetki ya da ağ hatası "yok" diye okunsaydı çağıran boşuna yüklerdi.
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Private kovanın **tek okuma yolu**. Varsayılan 15 dakika: dosya bir ekranda açılıp okunacak
   * kadar uzun, kopyalanıp paylaşılan bir adres olarak yaşayacak kadar kısa.
   */
  async getSignedReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }), {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Dosya sunucumuza hiç uğramaz; varsayılan 10 dakika, formu doldurup göndermeye yeter ve çalınan
   * bir adresin yaşayamayacağı kadar kısadır. `contentType` imzaya DAHİLDİR: imzalı bir "jpeg"
   * adresine başka türde dosya yüklenemez.
   */
  async getSignedUploadUrl(key: string, contentType: string, expiresInSeconds = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key), ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }
}

// ─── Ortamdan tembel kurulum ──────────────────────────────

type Cached = { key: string; service: R2Service | null };
const cache: Record<'public' | 'private', Cached | undefined> = { public: undefined, private: undefined };

/** İki kovanın ortak ayarları — hesap aynı, değişen yalnız kova adı. */
function baseConfig(): Omit<R2Config, 'bucket'> | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  // Prefix HAM geçilir: varsayılanı (`dev`) `resolvePrefixedKey` uygular. Burada `|| 'dev'` yazmak
  // okuma yolundan ayrışırdı (orada boş string = kök) → aynı anahtar iki farklı yere düşerdi.
  return { endpoint, accessKeyId, secretAccessKey, pathPrefix: process.env.R2_PATH_PREFIX };
}

/** Ayar aynı kaldıkça kurulan istemci döner; anahtar yenilenince istemci yeniden kurulur. */
function serviceFor(kind: 'public' | 'private', bucket: string | undefined): R2Service | null {
  const base = baseConfig();
  const key = base && bucket ? [base.endpoint, base.accessKeyId, base.secretAccessKey, base.pathPrefix ?? '', bucket].join('\n') : '';
  const hit = cache[kind];
  if (hit?.key === key) return hit.service;
  const service = base && bucket ? new R2Service({ ...base, bucket }) : null;
  cache[kind] = { key, service };
  return service;
}

/** Herkese açık kova; ayarsızsa `null` ve yükleme atlanır, ekran görselsiz devam eder. */
export function getR2(): R2Service | null {
  return serviceFor('public', process.env.R2_BUCKET_NAME);
}

/** Gizli kova; kimlik bilgisi herkese açık kovayla aynıdır, ayrışan yalnız kova adıdır (`R2_PRIVATE_BUCKET_NAME`). */
export function getR2Private(): R2Service | null {
  return serviceFor('private', process.env.R2_PRIVATE_BUCKET_NAME);
}

/**
 * Kimlik bilgisi R2'de geçiyor mu: olmayan bir nesneye HEAD atılır, "yok" cevabı anahtarın kabul edildiği demektir. Ağ hatası
 * fırlatılır ki "geçmedi" ile "ulaşılamadı" ayrı kalsın.
 */
export async function probeR2Credentials(credentials: {
  accessKeyId: string;
  secretAccessKey: string;
}): Promise<'ok' | 'rejected' | 'unconfigured'> {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET_NAME;
  if (!endpoint || !bucket) return 'unconfigured';
  try {
    await new R2Service({ endpoint, bucket, ...credentials }).fileEtag('__baglanti-sinamasi__');
    return 'ok';
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 401 || status === 403) return 'rejected';
    throw err;
  }
}
