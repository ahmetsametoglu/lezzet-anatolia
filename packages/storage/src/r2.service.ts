import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
 * Cloudflare R2 (S3-uyumlu) dosya deposu — referans proje (petitcigogne) R2Service deseni. Supabase
 * Storage YERİNE R2 kullanılır. DB her yerde RELATIVE key tutar; prefix (dev/prod izolasyonu) yalnız
 * R2 çağrısında uygulanır.
 *
 * ── İKİ KOVA, İKİ OKUMA YOLU ────────────────────────────────────────────────
 *
 * **Public kova** (`getR2()`): katalog, koleksiyon, paket görselleri. Okuma imzasızdır — saf string
 * birleştirmeyle (`publicImageUrl`, 05.11). İmza katalogda ZARARLIDIR: her render'da değişen adres
 * tarayıcı/CDN cache'ini öldürür, paylaşım (OG) kartı süre dolunca görselsiz kalır, Google Görseller
 * devreye giremez. O görsel zaten birazdan anonim ziyaretçiye gösterilecek şeydir.
 *
 * **Private kova** (`getR2Private()`): müşterinin YÜKLEDİĞİ dosyalar — şikâyet fotoğrafı (16.2),
 * ileride teslim onayı ve B2B belgesi. Bunların public adresi YOKTUR; okuma süreli imzalı adresle
 * yapılır (`getSignedReadUrl`) ve adresi sunucu ancak yetkiyi doğruladıktan sonra üretir.
 * SEO gerekçesi burada tersine döner: bu dosyaların aranabilir olması istenmez.
 *
 * R2'de "herkese açık" ayarı **kova düzeyindedir** — aynı kovanın içinde "şu klasör gizli"
 * denemez. İki kova bu yüzden zorunlu, tercih değil.
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

  /**
   * Süreli okuma adresi — **private kovanın tek okuma yolu** (referans proje `getSignedReadUrl`).
   *
   * Varsayılan 15 dakika: dosya bir ekranda açılıp okunacak kadar uzun, kopyalanıp paylaşılan bir
   * adres olarak yaşayacak kadar kısa. Bu, public kovanın `?v=` sürümlü kalıcı adresinin tam
   * tersidir — ve öyle olmalı: biri gösterilmek için vardır, öbürü gösterilmemek için.
   */
  async getSignedReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key) }), {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Tarayıcının dosyayı DOĞRUDAN R2'ye göndermesi için süreli yükleme adresi.
   *
   * Fotoğraf sunucumuza hiç uğramaz: telefonda çekilen 4 MB'lık kare, Next.js action gövde
   * sınırını da sunucu belleğini de meşgul etmez. Varsayılan 10 dakika — formu doldurup göndermeye
   * fazlasıyla yeter, çalınan bir adresin ömrü olamayacak kadar kısadır.
   *
   * `contentType` imzaya DAHİLDİR: adres bir kez üretildikten sonra başka türde bir dosya
   * yüklenemez (imzalı "jpeg" adresine script gönderilemez).
   */
  async getSignedUploadUrl(key: string, contentType: string, expiresInSeconds = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: this.resolveKey(key), ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }
}

// ─── Env'den lazy singleton ──────────────────────────────

let cached: R2Service | null | undefined;
let cachedPrivate: R2Service | null | undefined;

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

/**
 * Env değişkenlerinden R2Service üretir; eksikse `null` (graceful degradation — local'de R2 ayarsızsa
 * upload skip + görselsiz devam). Env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME, R2_PATH_PREFIX (opsiyonel; varsayılan 'dev').
 */
export function getR2(): R2Service | null {
  if (cached !== undefined) return cached;

  const base = baseConfig();
  const bucket = process.env.R2_BUCKET_NAME;
  cached = base && bucket ? new R2Service({ ...base, bucket }) : null;
  return cached;
}

/**
 * **Private kova** — müşterinin yüklediği dosyalar (şikâyet fotoğrafı, ileride belge/kanıt).
 * Ayarsızsa `null`: yerelde ek olmadan da çalışılır, ekran fotoğrafsız çizer, çökmez.
 *
 * Kimlik bilgisi public kovayla AYNIDIR (aynı R2 hesabı); ayrışan tek şey kova adıdır
 * (`R2_PRIVATE_BUCKET_NAME`). İkinci bir API token'ı gerekmez — ama istenirse ayrı token da
 * kullanılabilir, o zaman yalnız env değişir.
 */
export function getR2Private(): R2Service | null {
  if (cachedPrivate !== undefined) return cachedPrivate;

  const base = baseConfig();
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
  cachedPrivate = base && bucket ? new R2Service({ ...base, bucket }) : null;
  return cachedPrivate;
}
