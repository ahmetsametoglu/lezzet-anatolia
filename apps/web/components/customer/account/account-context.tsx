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
 *
 * **Tek istisna — onaylı toptancı mı (evet/hayır, 14.09):** telefon görünümünün sekme çubuğu
 * native'deki gibi kişiye göre değişiyor (perakende "Paketler", onaylı toptancı "Siparişler") ve
 * karar her sayfada çerçevede veriliyor. Bilgi müşterinin kendi durumu, hassas değil; kaynağı
 * vitrinin fiyat kapısıyla aynı (`readPricingViewer` → `channel === 'b2b'`: onaysız şirket orada
 * zaten B2C'dir, native `useWholesale`in "şirket VE onaylı" ölçütüyle aynı cevap).
 */
const AccountContext = createContext<CustomerIdentity | null>(null);
const WholesaleContext = createContext(false);

interface AccountProviderProps {
  account: CustomerIdentity | null;
  /** Onaylı toptancı mı; verilmezse `false` (ziyaretçi ve perakende). */
  wholesale?: boolean;
  children: ReactNode;
}

export function AccountProvider({ account, wholesale = false, children }: AccountProviderProps) {
  return (
    <AccountContext.Provider value={account}>
      <WholesaleContext.Provider value={wholesale}>{children}</WholesaleContext.Provider>
    </AccountContext.Provider>
  );
}

/** Girişli müşterinin künyesi; misafirde null. */
export function useAccount(): CustomerIdentity | null {
  return useContext(AccountContext);
}

/** Onaylı toptancı mı — ziyaretçide ve perakendede `false`. */
export function useWholesale(): boolean {
  return useContext(WholesaleContext);
}
