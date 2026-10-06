import { MovementTypeEnum, type MovementType } from '@lezzet/types';
import { parseBusinessFilter, type BusinessFilter } from '@/lib/business-filter';
import { one, oneOf, type RawParams } from '@/lib/url-params';

// Para ekranının URL sözleşmesi: süzgeç adreste taşınır, çünkü yenilemede aynı görünüm açılır ve sunucu süzebilir; imleç adrese
// yazılmaz. Hesap eksen değil daraltmadır: kasa, banka ve ödeme sağlayıcısı aynı kavramdır, varsayılan `all`, hesap bakiye şeridinin kartıyla seçilir.

export const FINANCE_PATH = '/operations/finance';

/** Hesap daraltması — `all` ya da bir hesabın kimliği. */
export const ALL_ACCOUNTS = 'all';

/**
 * Kuyruk daraltması: `all` bütün hareketler, `unmatched` izah bekleyen hareketler (paylaşılmış bağlantılar kırılmasın diye adı kaldı).
 * `unmatched` iş kuyruğudur; sayaç tıklanınca buraya iner ki sayı ile liste aynı ölçütten çıksın.
 */
const FINANCE_SCOPES = [ALL_ACCOUNTS, 'unmatched'] as const;
export type FinanceScope = (typeof FINANCE_SCOPES)[number];

/**
 * Ekranın iki listesi, hareketler ve belgeler; sekme adreste taşınır ki "bu ayın belgeleri" bağlantısı paylaşılabilsin. Tarih süzgeci
 * iki sekmede aynı anlamı taşır: hareketin değer günü, belgenin belge günü.
 */
const FINANCE_TABS = ['movements', 'documents'] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export interface FinanceUrlState {
  /** Hesap kimliği ya da `all`. Bilinmeyen kimlik sayfada `all`'a düşer — bkz. `resolveAccount`. */
  acct: string;
  tab: FinanceTab;
  type: MovementType | 'all';
  /** Tarih aralığı (`YYYY-MM-DD`; boş sınırsız); hazır aralıklar seçicinin içindedir (`DateRangeMenu`). */
  from: string;
  to: string;
  scope: FinanceScope;
  /** Belgeler sekmesinde yalnız AÇIK belgeler — ödenmemiş fatura, bize ödenecek dekont. */
  open: boolean;
  /** Listelerin iş süzgeci; bakiyeler bölünmez, çünkü iki iş aynı hesapları kullanır. */
  business: BusinessFilter;
}

const DEFAULTS: FinanceUrlState = {
  acct: ALL_ACCOUNTS,
  tab: 'movements',
  type: 'all',
  from: '',
  to: '',
  scope: ALL_ACCOUNTS,
  open: false,
  business: 'all',
};

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
    business: parseBusinessFilter(params.business),
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
  if (state.business !== DEFAULTS.business) p.set('business', state.business);
  const qs = p.toString();
  return qs ? `${FINANCE_PATH}?${qs}` : FINANCE_PATH;
}

/**
 * Adresteki hesap kimliği gerçek bir hesap mı, değilse `all`: kimlik elle düzenlenebilir ve pasifleştirilmiş hesabın bağlantısı kayıtlı
 * kalabilir; doğrulanmasaydı hiçbir kart seçili görünmeden boş liste "hiç hareket yok" diye okunurdu.
 */
export function resolveAccount(acct: string, accountIds: readonly string[]): string {
  return acct === ALL_ACCOUNTS || accountIds.includes(acct) ? acct : ALL_ACCOUNTS;
}
