import { useEffect, useSyncExternalStore } from 'react';

import { registerReadRecovery } from '@lezzet/mobile-kit/src/lib/auth/recover-reads';
import { registerSessionCleanup } from '@lezzet/mobile-kit/src/lib/auth/session-end';
import { fetchAddresses, type MeAddress } from '@/lib/api/addresses';

/*
  Hesabın adres listesi tek depoda durur, çünkü satın alma yeri (vitrin, sepet, checkout) ile hesap ekranı aynı listeyi okumalı; ekran
  başına liste, bir ekranda eklenen adresi ötekine göstermezdi. Okuyan ekran açılışta listeyi tazeler, yazma uçlarının döndürdüğü
  liste `publish`le yerleşir.
*/

type AddressesStatus = 'loading' | 'ready' | 'error';

interface AddressesState {
  status: AddressesStatus;
  addresses: MeAddress[];
}

const INITIAL: AddressesState = { status: 'loading', addresses: [] };

let state: AddressesState = INITIAL;
/** Okumanın kuşağı: yazma ya da oturum kapanışı havadaki eski cevabı geçersiz kılar. */
let generation = 0;
/** Okuma uçuşta mı; kurtarma aynı okumayı ikinci kez başlatmasın. */
let loading = false;
const listeners = new Set<() => void>();

function setState(next: AddressesState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeAddresses(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAddressesSnapshot(): AddressesState {
  return state;
}

/** Listeyi sunucudan okur ve bitince çözülür. */
export async function loadAddresses(): Promise<void> {
  const mine = ++generation;
  loading = true;
  const result = await fetchAddresses();
  if (mine !== generation) return;
  loading = false;
  setState(result.error !== null ? { status: 'error', addresses: [] } : { status: 'ready', addresses: result.data });
}

/** Yazma ucunun döndürdüğü güncel liste; havadaki okuma bu listeyi ezmesin diye kuşak ilerler. */
function publishAddresses(next: MeAddress[]): void {
  generation += 1;
  loading = false;
  setState({ status: 'ready', addresses: next });
}

function resetAddresses(): void {
  generation += 1;
  loading = false;
  setState(INITIAL);
}

// Oturum kapanınca liste düşer; bir sonraki müşteri öncekinin adreslerini görmemeli.
registerSessionCleanup(resetAddresses);
// Düşen liste oturumla başarılı bir istekte yeniden okunur; okunamamış liste "adresiniz yok" demek değildir.
registerReadRecovery(() => {
  if (state.status === 'error' && !loading) void loadAddresses();
});

export function useAddresses(enabled: boolean): {
  status: AddressesStatus;
  addresses: MeAddress[];
  publish: (next: MeAddress[]) => void;
  /** Yeniden okur ve bitince çözülür; çağıran yenileme halkasını buna göre kapatır. */
  reload: () => Promise<void>;
} {
  const current = useSyncExternalStore(subscribeAddresses, getAddressesSnapshot, getAddressesSnapshot);

  useEffect(() => {
    if (enabled) void loadAddresses();
  }, [enabled]);

  return { ...current, publish: publishAddresses, reload: loadAddresses };
}
