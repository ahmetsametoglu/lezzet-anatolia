'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CustomerIdentity } from '@/lib/guard';

/**
 * Oturumdaki müşterinin künyesi — **kökte, sunucudan bir kez okunur**.
 *
 * Başlıktaki hesap girişi bir istemci bileşeni olmak zorunda (`SiteFrame` hata sayfasında da
 * kullanılıyor ve orası `'use client'`; async olamaz). Künyeyi oradan ayrı bir server action ile
 * çekseydik her sayfada fazladan bir tur atılırdı. Bunun yerine layout — teslimat bölgelerinde
 * olduğu gibi — okuduğunu bağlama indiriyor.
 *
 * **Yalnız ad ve e-posta taşınır** (`CustomerIdentity`): rol, taslak durumu, kredi gibi alanlar
 * tarayıcıya inmez. Bir gün "hesabım" ekranı geldiğinde de burası büyümemeli — o ekran kendi
 * verisini sunucudan okur.
 */
const AccountContext = createContext<CustomerIdentity | null>(null);

export function AccountProvider({ account, children }: { account: CustomerIdentity | null; children: ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

/** Girişli müşterinin künyesi; misafirde null. */
export function useAccount(): CustomerIdentity | null {
  return useContext(AccountContext);
}
