import { createContext, useContext, type ReactNode } from 'react';

import { useStaffOrder, type StaffOrderStore } from './use-staff-order.hook';

/*
  Sipariş girişinin bağlamı: sayfa ve seçiciler ayrı rotalardır ama siparişin durumu tektir; kanca yığının girişinde bir kez kurulur ve
  rota değişince durum kaybolmaz.
*/

const StaffOrderContext = createContext<StaffOrderStore | null>(null);

interface StaffOrderProviderProps {
  children: ReactNode;
}

export function StaffOrderProvider({ children }: StaffOrderProviderProps) {
  const store = useStaffOrder();
  return <StaffOrderContext.Provider value={store}>{children}</StaffOrderContext.Provider>;
}

export function useStaffOrderContext(): StaffOrderStore {
  const value = useContext(StaffOrderContext);
  if (value === null) throw new Error('useStaffOrderContext yalnız StaffOrderProvider altında çağrılır (order/_layout kurar)');
  return value;
}
