import { WAREHOUSE_PARAM } from '@/lib/warehouse/filter';

// Depolar ekranının URL sözleşmesi — tek soru: **hangi tesise bakıyorum**.
//
// Parametre adı sistemin geri kalanıyla AYNI (`?depo=STR`) ama anlamı farklı ve fark önemli:
// Stok/Siparişler'de `depo` bir SÜZGEÇtir (listeyi daraltır), burada bir SEÇİMdir (kartı açar).
// İkisini ayrı adla yazmak daha "temiz" görünürdü ama bir bedeli vardı: Stok'tan kopyalanan bir
// bağlantı buraya yapıştırıldığında hiçbir şey seçilmezdi. Aynı ad, aynı kod, aynı tesis.
//
// Depo bağlamı (çerez) bu sayfayı DARALTMAZ — depolar bir yönetim nesnesidir, hepsi her zaman
// listelenir (`design/pages/admin-depolar.md §6`). Seçim yalnız buradaki adres parçasından gelir.

export const WAREHOUSES_PATH = '/operations/warehouses';

export interface WarehousesUrlState {
  /** Seçili tesisin KODU (`STR`); boş dize = liste görünümü. Kimlik değil kod: bağlantı okunur kalsın. */
  code: string;
}

export function parseWarehousesUrl(params: Record<string, string | string[] | undefined>): WarehousesUrlState {
  const raw = params[WAREHOUSE_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Büyük harfe çekilir: kod veride büyük harflidir ve `?depo=str` yazan bağlantı da çalışmalı.
  return { code: (value ?? '').trim().toLocaleUpperCase('tr') };
}

export function warehousesUrl(state: WarehousesUrlState): string {
  return state.code ? `${WAREHOUSES_PATH}?${WAREHOUSE_PARAM}=${encodeURIComponent(state.code)}` : WAREHOUSES_PATH;
}
