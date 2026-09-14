import { MovementTypeEnum, type MovementType } from '@lezzet/types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Para ekranının URL SÖZLEŞMESİ — müşteri/stok/fiyat ekranlarının deseni. Süzgeç adreste taşınır
// (yenilemede aynı görünüm açılır, sunucu okuyabildiği için süzme sunucuda yapılabilir); İMLEÇ
// adrese yazılmaz (CLAUDE.md §1) — paylaşılan bağlantı listenin ortasından başlamamalı.
//
// **Hesap bir EKSEN değil, bir DARALTMADIR** ve bu ekranın tamamını belirleyen karar bu. Tasarımın
// kendi sözleşmesi: *"Tek model → kasa/banka/Stripe aynı kavram; hesap yalnız bir filtre çipi"*
// (`Operasyon - Para.dc.html`), sayfa dokümanı da aynı cümleyi kuruyor (`admin-para.md §6`:
// "tek liste, hesap yalnız bir filtredir"). Bu yüzden varsayılan `all`; kasa ile bankanın ayrı
// ekranı yok, ayrı sözlüğü de yok. Süzgeç 12.17'den beri bakiye şeridinin KARTIDIR (kullanıcı
// isteği 13.09): kart hem bakiyeyi söyler hem daraltır — aynı hesabın adı iki yerde yazmaz.

export const FINANCE_PATH = '/operations/finance';

/** Hesap daraltması — `all` ya da bir hesabın kimliği. */
export const ALL_ACCOUNTS = 'all';

/**
 * Kuyruk daraltması.
 *  · `all`       → bütün hareketler
 *  · `unmatched` → izah bekleyen hareketler (13.09: ad paylaşılmış bağlantılar kırılmasın diye kaldı)
 *
 * `unmatched` bir süzgeçten fazlası: tasarım onu **iş kuyruğu** ilan ediyor (*"sağ üstteki
 * 'eşleşmemiş satır' sayacı iş kuyruğudur"*). Rozet tıklanınca buraya iner, yani sayı ile liste
 * aynı ölçütten çıkar — sayacın gösterdiği kümeyi açamamak, sayacı bir süse çevirirdi.
 */
const FINANCE_SCOPES = [ALL_ACCOUNTS, 'unmatched'] as const;
export type FinanceScope = (typeof FINANCE_SCOPES)[number];

/**
 * Ekranın iki listesi (12.17 · kullanıcı sorusu 13.09: "belgeleri nerede görüyorum?") — hareketler ve
 * belgeler. Sekme adreste taşınır: "bu ayın belgeleri" bağlantısı paylaşılabilsin. Tarih süzgeci iki
 * sekmede aynı anlamı taşır (hareketin değer günü · belgenin belge günü).
 */
const FINANCE_TABS = ['movements', 'documents'] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export interface FinanceUrlState {
  /** Hesap kimliği ya da `all`. Bilinmeyen kimlik sayfada `all`'a düşer — bkz. `resolveAccount`. */
  acct: string;
  tab: FinanceTab;
  type: MovementType | 'all';
  /**
   * Tarih ARALIĞI (`YYYY-MM-DD`; boş = sınırsız) — 12.17'de hazır dört aralığın ("son 7/30/90 gün")
   * yerini aldı: kullanıcı "tarih aralığında süzebilmeliyim" dedi ve "geçen ayın 5'i ile 20'si"
   * sorulamıyordu. Önayarlar aralık seçicinin içinde durur (`DateRangeMenu`).
   */
  from: string;
  to: string;
  scope: FinanceScope;
  /** Belgeler sekmesinde yalnız AÇIK belgeler — ödenmemiş fatura, bize ödenecek dekont. */
  open: boolean;
}

const DEFAULTS: FinanceUrlState = { acct: ALL_ACCOUNTS, tab: 'movements', type: 'all', from: '', to: '', scope: ALL_ACCOUNTS, open: false };

/** Adresteki gün — biçimi ve kendisi geçerliyse (`2026-13-40` düşer); değilse boş (sınırsız). */
function dayOf(raw: RawParams[string]): string {
  const value = one(raw).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : '';
}

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk bağlantı ekranı kırmaz). */
export function parseFinanceUrl(params: RawParams): FinanceUrlState {
  const from = dayOf(params.from);
  const to = dayOf(params.to);
  // Elle yazılmış TERS aralık çevrilir: "20'den 5'e" boş bir liste göstermez, kastedilen aralığı açar.
  const [start, end] = from && to && from > to ? [to, from] : [from, to];
  return {
    acct: one(params.acct).trim() || DEFAULTS.acct,
    tab: oneOf(params.tab, FINANCE_TABS, DEFAULTS.tab),
    type: oneOf(params.type, MovementTypeEnum.options, DEFAULTS.type),
    from: start,
    to: end,
    scope: oneOf(params.scope, FINANCE_SCOPES, DEFAULTS.scope),
    open: one(params.open) === '1',
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function financeUrl(state: FinanceUrlState): string {
  const p = new URLSearchParams();
  if (state.acct !== DEFAULTS.acct) p.set('acct', state.acct);
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.type !== DEFAULTS.type) p.set('type', state.type);
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  if (state.open) p.set('open', '1');
  const qs = p.toString();
  return qs ? `${FINANCE_PATH}?${qs}` : FINANCE_PATH;
}

/**
 * Adresteki hesap kimliği GERÇEK bir hesap mı — değilse `all`.
 *
 * Kimlik URL'de taşındığı için elle düzenlenebiliyor, ve pasifleştirilmiş bir hesabın bağlantısı
 * kayıtlı kalabiliyor. Doğrulamasaydık ekran hiçbir kartın seçili görünmediği bir hâlde boş liste
 * gösterirdi: operatör "hiç hareket yok" diye okur, oysa yalnız süzgeç geçersizdir.
 */
export function resolveAccount(acct: string, accountIds: readonly string[]): string {
  return acct === ALL_ACCOUNTS || accountIds.includes(acct) ? acct : ALL_ACCOUNTS;
}
