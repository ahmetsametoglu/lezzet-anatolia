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
// ekranı yok, ayrı sözlüğü de yok.

export const FINANCE_PATH = '/operations/finance';

/** Hesap daraltması — `all` ya da bir hesabın kimliği. */
export const ALL_ACCOUNTS = 'all';

/**
 * Kuyruk daraltması.
 *  · `all`       → bütün hareketler
 *  · `unmatched` → banka ekstresiyle eşleşmemiş satırlar
 *
 * `unmatched` bir süzgeçten fazlası: tasarım onu **iş kuyruğu** ilan ediyor (*"sağ üstteki
 * 'eşleşmemiş satır' sayacı iş kuyruğudur"*). Rozet tıklanınca buraya iner, yani sayı ile liste
 * aynı ölçütten çıkar — sayacın gösterdiği kümeyi açamamak, sayacı bir süse çevirirdi.
 */
const FINANCE_SCOPES = [ALL_ACCOUNTS, 'unmatched'] as const;
export type FinanceScope = (typeof FINANCE_SCOPES)[number];

/**
 * Tarih daraltması — HAZIR ARALIK, serbest tarih seçici değil.
 *
 * Tasarımın süzgeç barında "+ tarih" duruyor ama biçimini söylemiyor. Hazır aralığı seçtim çünkü bu
 * ekranın tarih sorusu bir rapor sorusu değil: operatör "geçen ay ne oldu"ya bakıyor, "12–19 Mart
 * arası"na değil (o soru Raporlar'ın, 12.6/12.7). Serbest aralık iki alan, iki doğrulama ve bir
 * takvim açardı; kazanç, bu ekranda kimsenin sormadığı bir kesinlik olurdu.
 *
 * Varsayılan `all` ve bu bilinçli: liste zaten en yeniden eskiye sonsuz kaydırıyor. Öntanımlı bir
 * pencere koysaydık, aradığı eski hareketi bulamayan operatör listede değil **süzgeçte** kaybolurdu.
 */
export const FINANCE_PERIODS = ['all', 'd7', 'd30', 'd90'] as const;
export type FinancePeriod = (typeof FINANCE_PERIODS)[number];

/** Gün karşılıkları — `all` penceresizdir, bu yüzden haritada yok. */
const PERIOD_DAYS: Record<Exclude<FinancePeriod, 'all'>, number> = { d7: 7, d30: 30, d90: 90 };

export interface FinanceUrlState {
  /** Hesap kimliği ya da `all`. Bilinmeyen kimlik sayfada `all`'a düşer — bkz. `resolveAccount`. */
  acct: string;
  type: MovementType | 'all';
  period: FinancePeriod;
  scope: FinanceScope;
}

const DEFAULTS: FinanceUrlState = { acct: ALL_ACCOUNTS, type: 'all', period: 'all', scope: ALL_ACCOUNTS };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk bağlantı ekranı kırmaz). */
export function parseFinanceUrl(params: RawParams): FinanceUrlState {
  return {
    acct: one(params.acct).trim() || DEFAULTS.acct,
    type: oneOf(params.type, MovementTypeEnum.options, DEFAULTS.type),
    period: oneOf(params.period, FINANCE_PERIODS, DEFAULTS.period),
    scope: oneOf(params.scope, FINANCE_SCOPES, DEFAULTS.scope),
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function financeUrl(state: FinanceUrlState): string {
  const p = new URLSearchParams();
  if (state.acct !== DEFAULTS.acct) p.set('acct', state.acct);
  if (state.type !== DEFAULTS.type) p.set('type', state.type);
  if (state.period !== DEFAULTS.period) p.set('period', state.period);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  const qs = p.toString();
  return qs ? `${FINANCE_PATH}?${qs}` : FINANCE_PATH;
}

/**
 * Adresteki hesap kimliği GERÇEK bir hesap mı — değilse `all`.
 *
 * Kimlik URL'de taşındığı için elle düzenlenebiliyor, ve pasifleştirilmiş bir hesabın bağlantısı
 * kayıtlı kalabiliyor. Doğrulamasaydık ekran hiçbir çipin seçili görünmediği bir hâlde boş liste
 * gösterirdi: operatör "hiç hareket yok" diye okur, oysa yalnız süzgeç geçersizdir.
 */
export function resolveAccount(acct: string, accountIds: readonly string[]): string {
  return acct === ALL_ACCOUNTS || accountIds.includes(acct) ? acct : ALL_ACCOUNTS;
}

/**
 * Dönem → tarih penceresi. `all` pencere üretmez (`undefined`), yani servise hiç süzgeç geçilmez.
 *
 * `now` DIŞARIDAN gelir: fonksiyon saf kalsın diye (test edilebilirlik) ve sunucu ile istemcinin
 * ayrı `Date.now()` okuması hidrasyon uyuşmazlığı doğurmasın diye.
 */
export function periodRange(period: FinancePeriod, now: Date): { from: string; to: string } | undefined {
  if (period === 'all') return undefined;
  const day = 86_400_000;
  const end = now.getTime();
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(end - PERIOD_DAYS[period] * day), to: iso(end) };
}

export const PERIOD_LABEL: Record<FinancePeriod, string> = {
  all: 'Tüm zamanlar',
  d7: 'Son 7 gün',
  d30: 'Son 30 gün',
  d90: 'Son 90 gün',
};
