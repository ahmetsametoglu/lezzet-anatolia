import { useSyncExternalStore } from 'react';

import type { MeAddress } from '@/lib/api/addresses';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { getSelectedDeliveryAddress, subscribeDeliverySelection } from './delivery-address-store';
import { getAddressesSnapshot, subscribeAddresses } from './use-addresses.hook';

/** Siparişin gideceği adres: seçili, yoksa varsayılan, yoksa ilk adres; `null` adres yok demektir. */
export function deliveryAddressOf(addresses: readonly MeAddress[], selectedId: string | null): MeAddress | null {
  return addresses.find((a) => a.id === selectedId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
}

/** Depoların şu anki cevabı; sepet deposu satın alma yerini React dışından buradan kurar. */
export function purchaseAddressNow(): MeAddress | null {
  return deliveryAddressOf(getAddressesSnapshot().addresses, getSelectedDeliveryAddress());
}

/**
 * Müşterinin yeri: adresi olan girişli müşteride teslimat adresi, değilse cihazın gezinme kodu; vitrin, katalog, ürün ve sepet aynı
 * yeri okur. Adres listesi yalnız oturum açıkken dolduğu için adresin varlığı girişi de söyler.
 */
export function usePurchasePlace(): { address: MeAddress | null; postalCode: string | null } {
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const { addresses } = useSyncExternalStore(subscribeAddresses, getAddressesSnapshot, getAddressesSnapshot);
  const selectedId = useSyncExternalStore(subscribeDeliverySelection, getSelectedDeliveryAddress, getSelectedDeliveryAddress);
  const address = deliveryAddressOf(addresses, selectedId);
  return { address, postalCode: address?.postalCode ?? onboarding?.postalCode ?? null };
}
