import { useSyncExternalStore } from 'react';

import { registerSessionCleanup } from '@lezzet/mobile-kit/src/lib/auth/session-end';

/*
  SİPARİŞİN GİDECEĞİ ADRES — SEPET İLE CHECKOUT'UN ORTAK SEÇİMİ.

  Sepet 10.08'de adrese bağlandı (künyesi `cart-store` → `purchasePostalCode`): satın alma tarafının tamamı
  ADRESLE çözülür, gezinme kodu vitrinde kalır. Bunun bir sonucu var — sepette "Değiştir" diyen
  müşterinin seçimi checkout'a TAŞINMALI. Taşınmasaydı iki ekran yine iki ayrı adrese bakardı ve az
  kapatılan ayrışma (sepette bir gerçek, checkout'ta başka) geri açılırdı.

  ── NEDEN BİR DEPO, EKRAN İÇİ `useState` DEĞİL ──────────────────────────────
  Seçim İKİ ekranın ortak gerçeği ve aralarında bir yönlendirme var; ekran state'i sepetten
  checkout'a geçerken ölürdü. Modül düzeyinde depo + `useSyncExternalStore` (sepet deposunun ve
  `use-me.hook`un aynı kalıbı) bunu kabuk sözleşmesine dokunmadan verir.

  ── `null` BİR SEÇİMSİZLİKTİR, BOŞLUK DEĞİL ─────────────────────────────────
  `null` = "müşteri henüz seçmedi, VARSAYILAN adres geçerli". Varsayılanın kimliğini burada
  saklamıyoruz: o sunucunun kararı (`isDefault`) ve değişebilir. Ekranlar `null` gördüğünde kendi
  listelerinden varsayılanı bulur — böylece burada bayatlayacak bir kopya durmaz.

  DİSKE YAZILMAZ: bu, bir oturumun alışverişine ait geçici bir seçim. Kalıcı olan "varsayılan
  adres"tir ve onun yeri sunucudur; burada saklamak, kayıtlı adresi silinmiş bir kimliği bir sonraki
  açılışta diriltirdi.
*/

let selectedId: string | null = null;
/** Gel-al seçimi: depo bir adres gibi seçilir ve adres seçimini düşürür — sepet ve checkout tek yere göre okunur. */
let selectedPickupId: string | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return selectedId;
}

function getPickupSnapshot(): string | null {
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
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Seçili gel-al deposu; `null` = adrese teslim. Sepet ve checkout aynı seçimi okur. */
export function useSelectedPickupWarehouse(): string | null {
  return useSyncExternalStore(subscribe, getPickupSnapshot, getPickupSnapshot);
}
