// Tedarik ekranının URL SÖZLEŞMESİ — fiyat/stok ekranlarının deseni. Sekme adreste taşınır:
// yenilemede aynı görünüm açılır ve okuma sunucuda sekmeye bağlı kalabilir (09.4'te ölçülen desen).

const PROCUREMENT_PATH = '/operations/procurement';

export const PROCUREMENT_TABS = ['suggestions', 'orders', 'suppliers'] as const;
export type ProcurementTab = (typeof PROCUREMENT_TABS)[number];

export interface ProcurementUrlState {
  tab: ProcurementTab;
}

const DEFAULTS: ProcurementUrlState = { tab: 'suggestions' };

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: string | string[] | undefined): string => (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseProcurementUrl(params: RawParams): ProcurementUrlState {
  const tabRaw = one(params.tab);
  return { tab: PROCUREMENT_TABS.find((t) => t === tabRaw) ?? DEFAULTS.tab };
}

/** Ekran durumu → URL. Varsayılan yazılmaz (temiz adres). */
export function procurementUrl(state: ProcurementUrlState): string {
  return state.tab === DEFAULTS.tab ? PROCUREMENT_PATH : `${PROCUREMENT_PATH}?tab=${state.tab}`;
}

export const TAB_LABEL: Record<ProcurementTab, string> = {
  suggestions: 'Sipariş zamanı',
  orders: 'Siparişler',
  suppliers: 'Tedarikçiler',
};
