import { createContext, useContext, type ReactNode } from 'react';
import type { SalePlace } from '@lezzet/types';

import { useSale } from './use-sale.hook';

/*
  SATIŞ BAĞLAMI (kullanıcı kararı 26.08: "ürün listesi ve sepet aynı yerde olması kötü") — akış
  iki yüzeye ayrıldı: katalog (`/sale`) ve sepet (`/sale/cart`). Sepet DURUMU ikisinin ortak
  gerçeğidir ve rota değişince kaybolamaz; bu yüzden hook tek kez burada kurulur, iki ekran aynı
  örneği okur. Param/route ile taşımak seçenek değildi: sepet bir kimlik değil, yaşayan durumdur.

  ── SATIŞ YERİ AYRI BİR BAĞLAMDA (01.09) ────────────────────────────────────
  `place` sepetle aynı nesnede taşınmıyor çünkü okuyanları farklı: sepeti katalog ve sepet ekranı
  okur, yeri BİR DE son satışlar okur — ve o ekran sepet bağlamına bilerek girmiyor ("kendi okuması
  var, sepetle işi yok"). Tek nesnede birleştirmek, sepetle işi olmayan bir ekranı sepete
  bağlamak olurdu.
*/

type SaleStore = ReturnType<typeof useSale>;

const SaleContext = createContext<SaleStore | null>(null);
const SalePlaceContext = createContext<SalePlace | null>(null);

export function SaleProvider({ place, children }: { place: SalePlace; children: ReactNode }) {
  const sale = useSale(place);
  return (
    <SalePlaceContext.Provider value={place}>
      <SaleContext.Provider value={sale}>{children}</SaleContext.Provider>
    </SalePlaceContext.Provider>
  );
}

export function useSaleContext(): SaleStore {
  const value = useContext(SaleContext);
  if (value === null) throw new Error('useSaleContext yalnız SaleProvider altında çağrılır (sale/_layout kurar)');
  return value;
}

/** Satış yeri — "kapıdayım" mı "aracımdayım" mı. Ekranların cümlesi de buna göre değişir. */
export function useSalePlace(): SalePlace {
  const value = useContext(SalePlaceContext);
  if (value === null) throw new Error('useSalePlace yalnız SaleProvider altında çağrılır (sale/_layout kurar)');
  return value;
}
