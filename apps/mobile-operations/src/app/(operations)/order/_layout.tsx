import { Stack } from 'expo-router';

import { StaffOrderProvider } from '@/screens/staff-order/staff-order-context';

/* Sağlayıcı yığının girişinde durur: sayfa ve seçiciler ayrı rotalardır ama siparişin durumu tektir. */
export default function StaffOrderLayout() {
  return (
    <StaffOrderProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </StaffOrderProvider>
  );
}
