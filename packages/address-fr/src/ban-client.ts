import { toSuggestion, type AddressKind, type AddressSuggestion } from './address';
import { BanCollectionSchema } from './ban.schema';

/*
  FRANSA ADRES SERVİSİ (BAN) İSTEMCİSİ — devletin coğrafi kodlama hizmeti.

  ── ADRES DEĞİŞTİ, ÖLÇÜLDÜ (09.08) ─────────────────────────────────────────
  Yıllardır bilinen kapı `api-adresse.data.gouv.fr` **KULLANIMDAN KALDIRILDI**; resmî duyuru
  kapanışı Ocak 2026 sonu olarak verdi (bugün o tarih GEÇTİ ve kapı hâlâ cevap veriyor — yani
  ödünç zamanda yaşıyor, üstüne kod yazılmaz). Yerine IGN'in Géoplateforme servisi geçti:
  `https://data.geopf.fr/geocodage`. İkisi de canlıyken ölçüldü, yenisi seçildi.

  ── ANAHTAR YOK, AMA SINIR VAR ─────────────────────────────────────────────
  API anahtarı istemiyor (ölçüldü: çıplak istek 200 döndü). Buna karşılık IP başına **saniyede 50
  istek** sınırı var; aşılınca 429 + `retry-after` geliyor ve 5 saniye kapı kapanıyor. Sınır İSTEMCİ
  BAŞINA değil IP başına: sunucudan çağrılırsa TÜM müşteriler tek IP'yi paylaşır, cihazdan
  çağrılırsa herkes kendi IP'sini. Bu paket ikisini de destekler; kararı çağıran verir.

  ── BU PAKET LOG YAZMAZ ────────────────────────────────────────────────────
  `@lezzet/observability` node-only (pino) ve bu paket React Native içinde de koşacak. Onun yerine
  her başarısızlık ADLI bir sonuç olarak döner (`rate_limited` · `unavailable` · `invalid_response`);
  loglamak çağıranın işi — o hangi ortamda olduğunu bilir. Sessiz `catch` yok: yakalanan her hata
  bir ada çevrilir (CLAUDE §1).

  ── FIRLATMAZ ──────────────────────────────────────────────────────────────
  Hiçbir yol `throw` etmez. Adres tamamlama YARDIMCI bir özelliktir: servis düşerse müşteri adresini
  elle yazmaya devam edebilmeli, ekran çökmemeli. Çağıran `status`a bakar.

  ── LİSANS ─────────────────────────────────────────────────────────────────
  Veri Etalab 2.0 açık lisansı altında; kaynak gösterimi gerekiyor (ekranda "Adresler: Base
  Adresse Nationale" gibi bir künye). Bu paketin işi değil, kullanan YÜZEYİN işi — rapor edildi.
*/

const BASE_URL = 'https://data.geopf.fr/geocodage';

/**
 * Ağa çıkmadan önceki en kısa sorgu. Altındaki her şey servise gürültüdür: iki harf tüm Fransa'yı
 * getirir ve kullanıcıya işe yaramaz bir liste gösterir. Sorgu kısaysa AĞA HİÇ ÇIKILMAZ.
 */
export const MIN_QUERY_LENGTH = 3;

/** Varsayılan öneri sayısı — tasarımın açılır listesi bu kadarını gösteriyor. */
const DEFAULT_LIMIT = 5;

/** Ağ beklemesinin tavanı. Adres önerisi yardımcıdır; on saniye bekleyen bir alan yazmayı engeller. */
const DEFAULT_TIMEOUT_MS = 6000;

/** Sınır aşımında servisin söylediği bekleme yoksa varsayılan (duyurulan kapanma süresi 5 sn). */
const DEFAULT_RETRY_AFTER_MS = 5000;

/**
 * Aramanın sonucu — hepsi ADLI. `ok` dışındaki her hâl, çağıranın müşteriye ne söyleyeceğini
 * bilmesi için ayrı tutulur: "çok kısa yazdınız" ile "servis şu an yok" aynı cümle değildir.
 */
export type AddressLookup =
  | { status: 'ok'; suggestions: AddressSuggestion[] }
  /** Sorgu `MIN_QUERY_LENGTH` altında — ağa çıkılmadı. Hata DEĞİL, henüz soru sorulmadı. */
  | { status: 'too_short' }
  /** IP saniyelik sınırı aştı. `retryAfterMs` servisin söylediği süre; söylemediyse varsayılan. */
  | { status: 'rate_limited'; retryAfterMs: number }
  /** Ağ düştü, zaman aşımı ya da servis 5xx. Geçici kabul edilir. */
  | { status: 'unavailable' }
  /** Cevap geldi ama BEKLEDİĞİMİZ ŞEKİLDE değil — sözleşme değişmiş olabilir. */
  | { status: 'invalid_response' };

export interface AddressSearchInput {
  /** Kullanıcının yazdığı serbest metin. */
  query: string;
  /** Posta koduna daraltma — biliniyorsa sonuçları ciddi biçimde keskinleştirir. */
  postalCode?: string;
  /** INSEE komün koduna daraltma (posta kodundan kesin). */
  cityCode?: string;
  /** Yalnız belirli incelikte sonuç iste (ör. yalnız kapı numaraları). */
  kind?: AddressKind;
  limit?: number;
  timeoutMs?: number;
  /** Çağıranın kendi iptali — tuşa basıldıkça önceki isteği kesmek için. */
  signal?: AbortSignal;
}

export interface ReverseAddressInput {
  latitude: number;
  longitude: number;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Serbest metinden adres önerileri.
 *
 * `autocomplete=1` bilerek AÇIK: kullanıcı yazarken çağrılıyor ve servis son kelimeyi yarım kabul
 * edip tamamlıyor. Kapalı olsaydı "12 rue du mar" hiçbir şey döndürmezdi.
 */
export async function searchAddresses(input: AddressSearchInput): Promise<AddressLookup> {
  const query = input.query.trim();
  if (query.length < MIN_QUERY_LENGTH) return { status: 'too_short' };

  const params = new URLSearchParams({
    q: query,
    index: 'address',
    autocomplete: '1',
    limit: String(input.limit ?? DEFAULT_LIMIT),
  });
  if (input.postalCode !== undefined) params.set('postcode', input.postalCode);
  if (input.cityCode !== undefined) params.set('citycode', input.cityCode);
  if (input.kind !== undefined) params.set('type', input.kind);

  return read(`${BASE_URL}/search?${params.toString()}`, input.timeoutMs, input.signal);
}

/**
 * Koordinattan adres — "konumumu kullan" akışının karşılığı.
 *
 * Cihazın verdiği nokta bir kapı numarasına tam oturmaz; servis EN YAKIN kaydı döner ve uzaklığı
 * `distanceMeters`ta söyler. Uzaklığı yok sayıp ilk sonucu "adresiniz bu" diye basmak, müşteriye
 * komşu sokağı yazdırabilir — kararı çağıran verir, bu paket sayıyı görünür kılar.
 */
export async function reverseAddress(input: ReverseAddressInput): Promise<AddressLookup> {
  const params = new URLSearchParams({
    lat: String(input.latitude),
    lon: String(input.longitude),
    index: 'address',
    limit: String(input.limit ?? 1),
  });
  return read(`${BASE_URL}/reverse?${params.toString()}`, input.timeoutMs, input.signal);
}

/* Tek okuma yolu: iki uç da aynı hata ailesinden geçsin. İkisi ayrı yazılsaydı biri bir gün
   429'u ötekinden farklı yorumlardı. */
async function read(url: string, timeoutMs = DEFAULT_TIMEOUT_MS, external?: AbortSignal): Promise<AddressLookup> {
  /* Zaman aşımı ELLE kuruluyor: `AbortSignal.timeout` her RN motorunda yok, `AbortController` her
     yerde var. Çağıranın kendi iptali de aynı denetçiye bağlanır — iki sinyali birleştiren
     `AbortSignal.any` de her yerde olmadığı için dinleyiciyle yapılıyor. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const relay = () => controller.abort();
  external?.addEventListener('abort', relay);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });

    if (response.status === 429) {
      return { status: 'rate_limited', retryAfterMs: retryAfterOf(response) };
    }
    if (!response.ok) return { status: 'unavailable' };

    const parsed = BanCollectionSchema.safeParse(await response.json());
    if (!parsed.success) return { status: 'invalid_response' };

    return { status: 'ok', suggestions: parsed.data.features.map(toSuggestion) };
  } catch {
    /* Ağ hatası, iptal ve zaman aşımı burada birleşir ve hepsi GEÇİCİ sayılır: üçünün de
       müşteriye söyleyeceği şey aynı ("şu an öneremiyoruz, elle yazabilirsiniz"). Ayrı ayrı
       raporlamak çağıranı ilgilendirmeyen bir ayrımı ekrana taşırdı. */
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', relay);
  }
}

/** `retry-after` saniye cinsinden gelir; okunamıyorsa duyurulan varsayılana düşülür. */
function retryAfterOf(response: Response): number {
  const header = response.headers.get('retry-after');
  if (header === null) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}
