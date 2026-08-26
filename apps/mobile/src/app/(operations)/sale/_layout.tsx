import { Stack } from 'expo-router';

import { SaleProvider } from '@/screens/sale/sale-context';

/*
  YERİNDE SATIŞ YIĞINI — katalog (`/sale`) · sepet (`/sale/cart`) · son satışlar (`/sale/history`).
  Sağlayıcı BURADA durur: sepet durumu iki yüzeyin ortak gerçeğidir ve rota değişince kaybolamaz
  (gerekçe `sale-context.tsx` künyesinde).
*/
export default function SaleLayout() {
  return (
    <SaleProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SaleProvider>
  );
}
