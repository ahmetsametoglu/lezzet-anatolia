import { CustomerTypeEnum, type CustomerType } from '@lezzet/types';

// Müşteri ekranının URL SÖZLEŞMESİ — tek kaynak (ürünler/stok/fiyat ekranlarının deseni). Süzgeçler
// adreste taşınır çünkü yenilemede aynı görünüm açılır ve SUNUCU okuyabildiği için süzme sunucuda
// yapılabilir. İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.
//
// **Buradaki süzgeçlerin HEPSİ sunucuda uygulanır** ve bu bilinçli bir ayrım: fiyat/stok ekranlarında
// `scope` çipi client'ta süzüyor (marj bir KARAR, SQL'e çevrilemez) ve o yüzden yüklenmiş sayfaları
// silen bir tur atıyor (bkz. 09.17). Müşteri daraltmalarının hiçbiri karar değil, hepsi bir KOLON —
// o hatanın bu ekranda karşılığı yok.

export const CUSTOMERS_PATH = '/operations/customers';

/**
 * Durum daraltması — "hangi müşteriler görünsün".
 *  · `all`       → hepsi
 *  · `credit`    → vade yetkisi açık olanlar (`credit_enabled`)
 *  · `draft`     → taslak kayıtlar (WhatsApp telefonuyla otomatik açılmış — birleştirme adayı)
 *  · `b2bPending`→ onay bekleyen B2B başvuruları
 *
 * Dördü de tek kolona bakar, yani sunucuda süzülür. "Gecikmiş vade" BURADA YOK ve olmamalı: o bir
 * kolon değil, siparişlerden türeyen bir karardır (`isOverdue`) — daraltma olarak eklenirse ölçüt
 * iki yerde yaşar. Gecikme bilgisi detayda ve sayaçta durur (09.9b).
 */
export const CUSTOMER_SCOPES = ['all', 'credit', 'draft', 'b2bPending'] as const;
export type CustomerScope = (typeof CUSTOMER_SCOPES)[number];

export interface CustomersUrlState {
  /** Telefon/ad/e-posta araması (boş = yok). Telefon KİMLİK anahtarıdır — WhatsApp'tan gelen müşteri onunla bulunur. */
  q: string;
  /** Müşteri tipi ya da 'all'. */
  type: CustomerType | 'all';
  scope: CustomerScope;
}

const DEFAULTS: CustomersUrlState = { q: '', type: 'all', scope: 'all' };

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: string | string[] | undefined): string => (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseCustomersUrl(params: RawParams): CustomersUrlState {
  const typeRaw = one(params.type);
  const scopeRaw = one(params.scope);
  return {
    q: one(params.q).trim(),
    type: CustomerTypeEnum.options.find((t) => t === typeRaw) ?? DEFAULTS.type,
    scope: CUSTOMER_SCOPES.find((s) => s === scopeRaw) ?? DEFAULTS.scope,
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function customersUrl(state: CustomersUrlState): string {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.type !== DEFAULTS.type) p.set('type', state.type);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  const qs = p.toString();
  return qs ? `${CUSTOMERS_PATH}?${qs}` : CUSTOMERS_PATH;
}

/** Ekran durumu → SERVİS süzgeçleri. 'all' olanlar hiç geçilmez (undefined). */
export function toCustomerFilters(state: CustomersUrlState): {
  query?: string;
  type?: CustomerType;
  isDraft?: boolean;
  creditEnabled?: boolean;
  b2bPending?: boolean;
} {
  return {
    query: state.q || undefined,
    type: state.type === 'all' ? undefined : state.type,
    isDraft: state.scope === 'draft' ? true : undefined,
    creditEnabled: state.scope === 'credit' ? true : undefined,
    b2bPending: state.scope === 'b2bPending' ? true : undefined,
  };
}

export const SCOPE_LABEL: Record<CustomerScope, string> = {
  all: 'Tümü',
  credit: 'Vadeli',
  // Kolon adı (`is_draft`) ekrana yazılmaz: operatörün gördüğü şey veritabanı alanı değil, kaydın
  // hâli — WhatsApp'tan kendiliğinden açılmış, eksik bilgili, birleştirme bekleyen bir kayıt.
  draft: 'Taslak',
  b2bPending: 'B2B onay bekleyen',
};

/**
 * Tip adları — tasarım `B2C` / `B2B` yazıyor ve öyle kalıyor. "Bireysel/Şirket" daha açık görünüyor
 * ama operatörün kendi sözlüğü kanal adlarıdır: fiyat, sipariş ve rapor ekranlarının hepsi kanaldan
 * konuşuyor (`channel: b2c|b2b`). İki sözlük tutmak aynı müşteriyi iki adla anmaktı.
 */
export const TYPE_LABEL: Record<CustomerType, string> = {
  individual: 'B2C',
  company: 'B2B',
};
