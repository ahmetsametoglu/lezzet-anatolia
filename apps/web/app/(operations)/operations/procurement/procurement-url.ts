// Tedarik ekranının URL SÖZLEŞMESİ — fiyat/stok/sipariş ekranlarının deseni. Sekme ve süzgeçler
// adreste taşınır: yenilemede aynı görünüm açılır ve okuma sunucuda sekmeye bağlı kalabilir
// (09.4'te ölçülen desen).
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.

import { PurchaseOrderStatusEnum, type PurchaseOrderStatus } from '@lezzet/types';
import { one, oneOf, type RawParams } from '@/lib/url-params';

const PROCUREMENT_PATH = '/operations/procurement';

// Export (15.08): `loading.tsx` sekme adlarını gerçek metinle çizmek için sırayı buradan okur.
export const PROCUREMENT_TABS = ['suggestions', 'orders', 'suppliers'] as const;
export type ProcurementTab = (typeof PROCUREMENT_TABS)[number];

/**
 * Sipariş listesinin durum süzgeci — küme ENUM'DAN türetilir.
 *
 * Elle yazılsaydı yeni bir durum eklendiğinde süzgeç onu tanımaz, o durumdaki siparişler yalnız
 * "Tümü"nde görünür ve kimse listeyi güncellemeyi hatırlamazdı (sipariş ekranının sekme dersi).
 */
export const ORDER_STATUS_FILTERS = ['all', ...PurchaseOrderStatusEnum.options] as const;
export type OrderStatusFilter = (typeof ORDER_STATUS_FILTERS)[number];

export interface ProcurementUrlState {
  tab: ProcurementTab;
  /** Sipariş durumu süzgeci — 'all' ya da tek durum. Sunucuda uygulanır (`listRows`). */
  status: OrderStatusFilter;
  /** Tedarikçi kimliği; boş = süzgeç yok. Kimlik taşınır çünkü ad tekil değildir. */
  supplier: string;
}

const DEFAULTS: ProcurementUrlState = { tab: 'suggestions', status: 'all', supplier: '' };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseProcurementUrl(params: RawParams): ProcurementUrlState {
  return {
    tab: oneOf(params.tab, PROCUREMENT_TABS, DEFAULTS.tab),
    status: oneOf(params.status, ORDER_STATUS_FILTERS, DEFAULTS.status),
    // Kimlik burada DOĞRULANMAZ: silinmiş bir tedarikçinin kimliği boş liste verir, hata değil.
    supplier: one(params.supplier).trim(),
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function procurementUrl(state: ProcurementUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  // Süzgeçler yalnız kendi sekmesinde anlamlı: başka sekmede adreste kalmaları, sekme dönüşünde
  // görünmeyen bir daraltmayı sessizce taşımak olurdu.
  if (state.tab === 'orders') {
    if (state.status !== DEFAULTS.status) p.set('status', state.status);
    if (state.supplier) p.set('supplier', state.supplier);
  }
  const qs = p.toString();
  return qs ? `${PROCUREMENT_PATH}?${qs}` : PROCUREMENT_PATH;
}

/**
 * SERVİS süzgeçleri (`listRows`). Sipariş kümesi veriyle büyür — süzmeyi ekranda yapmak listenin
 * kuyruğunu yutardı (sayfalanan okumanın kuralı). İkinci sayfa da AYNI süzgeci taşımalı, yoksa
 * liste sessizce karışır: bu yüzden imleçli action da bu sözleşmeyi alır.
 */
export function toOrderFilters(state: ProcurementUrlState): { status?: PurchaseOrderStatus; supplierId?: string } {
  return {
    status: state.status === 'all' ? undefined : state.status,
    supplierId: state.supplier || undefined,
  };
}

export const TAB_LABEL: Record<ProcurementTab, string> = {
  suggestions: 'Sipariş zamanı',
  orders: 'Siparişler',
  suppliers: 'Tedarikçiler',
};
