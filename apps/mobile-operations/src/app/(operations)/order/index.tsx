import { useLocalSearchParams } from 'expo-router';

import { StaffOrderScreen } from '@/screens/staff-order/staff-order-screen';

/* Sipariş sayfası — yığının girişi; depo merkezi (D10) parametresiz, kurye durağı durağın siparişi ve sırasıyla gelir. */
export default function StaffOrderRoute() {
  const { fromOrder, stop } = useLocalSearchParams<{ fromOrder?: string; stop?: string }>();
  return <StaffOrderScreen fromOrderId={fromOrder ?? null} stopNo={stop ?? null} />;
}
