import { useSyncExternalStore } from 'react';

import { registerSessionCleanup } from '@lezzet/mobile-kit/src/lib/auth/session-end';

/*
  Müşterinin seçtiği teslimat adresi ya da gel-al deposu: vitrin, sepet ve checkout aynı seçimi okur, bu yüzden ekran durumu değil
  modül deposudur. `null` seçimsizliktir ve varsayılan adres geçerlidir; diske yazılmaz, çünkü kalıcı olan sunucudaki varsayılandır.
*/

let selectedId: string | null = null;
/** Gel-al seçimi: depo bir adres gibi seçilir ve adres seçimini düşürür — sepet ve checkout tek yere göre okunur. */
let selectedPickupId: string | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeDeliverySelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSelectedDeliveryAddress(): string | null {
  return selectedId;
}

export function getSelectedPickupWarehouse(): string | null {
  return selectedPickupId;
}

/** Seçimi yazar — sepet ya da checkout, hangisinde seçildiyse öteki de aynı adresi okur. */
export function selectDeliveryAddress(id: string | null): void {
  if (selectedId === id && selectedPickupId === null) return;
  selectedId = id;
  // Adres seçmek gel-al'dan dönmektir: iki seçim aynı anda geçerli olamaz.
  selectedPickupId = null;
  emit();
}

/** Gel-al: adres seçicideki depo kartı; `null` adrese döner. Adres seçimi düşer, varsayılan adres fatura adresi olarak kalır. */
export function selectPickupWarehouse(warehouseId: string | null): void {
  if (selectedPickupId === warehouseId) return;
  selectedPickupId = warehouseId;
  if (warehouseId !== null) selectedId = null;
  emit();
}

/**
 * Müşteri değiştiğinde (çıkış/giriş) seçim DÜŞER: önceki müşterinin adres kimliği yeni müşteride
 * hiçbir şeye karşılık gelmez ve ekranlar onu ararken varsayılana düşmek yerine boş liste görürdü.
 */
export function resetDeliveryAddress(): void {
  selectDeliveryAddress(null);
}

/* Oturum kapanınca seçim düşer; kapanış kapısı bu depoyu adıyla tanımadığı için depo kendini kaydeder. */
registerSessionCleanup(resetDeliveryAddress);

/** Seçili adres kimliği; `null` = varsayılan geçerli (künye). Ekranların okuma seam'i. */
export function useSelectedDeliveryAddress(): string | null {
  return useSyncExternalStore(subscribeDeliverySelection, getSelectedDeliveryAddress, getSelectedDeliveryAddress);
}

/** Seçili gel-al deposu; `null` = adrese teslim. Sepet ve checkout aynı seçimi okur. */
export function useSelectedPickupWarehouse(): string | null {
  return useSyncExternalStore(subscribeDeliverySelection, getSelectedPickupWarehouse, getSelectedPickupWarehouse);
}
