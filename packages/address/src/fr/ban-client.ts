import { MIN_QUERY_LENGTH } from '../min-query-length';
import { toSuggestion, type AddressKind, type AddressSuggestion } from './address';
import { BanCollectionSchema } from './ban.schema';
import { houseNumberFirst } from './query';

/*
  Fransa adres servisi (BAN) istemcisi. Anahtar istemez ama IP başına saniyede 50 istek sınırı var; sunucudan çağrılırsa
  bütün müşteriler tek IP'yi paylaştığı için nereden çağrılacağına çağıran karar verir.
  Fırlatmaz ve log yazmaz: React Native'de de koşar ve öneri yardımcı bir özelliktir; her başarısızlık adlı bir sonuç olarak döner.
*/

// Eski `api-adresse.data.gouv.fr` kapısı kullanımdan kalktı; yerine IGN Géoplateforme.
const BASE_URL = 'https://data.geopf.fr/geocodage';

/** Tasarımın açılır listesi bu kadarını gösteriyor. */
const DEFAULT_LIMIT = 5;

/** Öneri yardımcıdır; uzun bekleyen bir alan yazmayı engeller. */
const DEFAULT_TIMEOUT_MS = 6000;

/** Servis sınır aşımında süre söylemezse duyurulan kapanma süresi. */
const DEFAULT_RETRY_AFTER_MS = 5000;

/** Aramanın sonucu; "çok kısa yazdınız" ile "servis şu an yok" aynı cümle olmadığı için her hâl ayrı. */
export type AddressLookup =
  | { status: 'ok'; suggestions: AddressSuggestion[] }
  /** Sorgu `MIN_QUERY_LENGTH` altında; ağa çıkılmadı. */
  | { status: 'too_short' }
  | { status: 'rate_limited'; retryAfterMs: number }
  /** Ağ düştü, zaman aşımı ya da 5xx; geçici. */
  | { status: 'unavailable' }
  /** Cevap beklenen şekilde değil; sözleşme değişmiş olabilir. */
  | { status: 'invalid_response' };

export interface AddressSearchInput {
  query: string;
  /** Posta koduna daraltma; sert süzgeç. */
  postalCode?: string;
  /** INSEE komün koduna daraltma. */
  cityCode?: string;
  /**
   * Yakınlık ipucu: süzgeç değil sıralama tercihi; uzaktaki adres listede kalır, yalnız sırası düşer.
   * Yeri bilinmeyen ziyaretçide gönderilmez, çünkü uydurma bir merkez sıralamayı sessizce bozar.
   */
  near?: { latitude: number; longitude: number };
  /** Yalnız belirli incelikte sonuç, örneğin yalnız kapı numaraları. */
  kind?: AddressKind;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Serbest metinden adres önerileri; kullanıcı yazarken çağrıldığı için servis son kelimeyi yarım kabul eder (`autocomplete=1`). */
export async function searchAddresses(input: AddressSearchInput): Promise<AddressLookup> {
  const query = input.query.trim();
  if (query.length < MIN_QUERY_LENGTH) return { status: 'too_short' };

  const found = await read(searchUrl(input, query), input.timeoutMs, input.signal);
  // Numara sonda yazıldıysa ve ilk soru boş döndüyse numara başa alınarak bir kez daha sorulur (`query.ts`).
  if (found.status !== 'ok' || found.suggestions.length > 0) return found;
  const reordered = houseNumberFirst(query);
  return reordered === null ? found : read(searchUrl(input, reordered), input.timeoutMs, input.signal);
}

function searchUrl(input: AddressSearchInput, query: string): string {
  const params = new URLSearchParams({
    q: query,
    index: 'address',
    autocomplete: '1',
    limit: String(input.limit ?? DEFAULT_LIMIT),
  });
  if (input.postalCode !== undefined) params.set('postcode', input.postalCode);
  if (input.cityCode !== undefined) params.set('citycode', input.cityCode);
  if (input.kind !== undefined) params.set('type', input.kind);
  if (input.near !== undefined) {
    params.set('lat', String(input.near.latitude));
    params.set('lon', String(input.near.longitude));
  }
  return `${BASE_URL}/search?${params.toString()}`;
}

async function read(url: string, timeoutMs = DEFAULT_TIMEOUT_MS, external?: AbortSignal): Promise<AddressLookup> {
  // Zaman aşımı elle kuruluyor: `AbortSignal.timeout` ve `AbortSignal.any` her React Native motorunda yok.
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
    // Ağ hatası, iptal ve zaman aşımı geçici sayılır; müşteriye söylenecek şey üçünde de aynı.
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', relay);
  }
}

/** `retry-after` saniye gelir; okunamıyorsa varsayılan. */
function retryAfterOf(response: Response): number {
  const header = response.headers.get('retry-after');
  if (header === null) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}
