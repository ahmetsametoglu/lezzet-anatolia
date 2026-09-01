import { useState } from 'react';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { SalePlaceEnum, type SalePlace } from '@lezzet/types';

import { SaleProvider } from '@/screens/sale/sale-context';

/*
  YERİNDE SATIŞ YIĞINI — katalog (`/sale`) · sepet (`/sale/cart`) · son satışlar (`/sale/history`).
  Sağlayıcı BURADA durur: sepet durumu iki yüzeyin ortak gerçeğidir ve rota değişince kaybolamaz
  (gerekçe `sale-context.tsx` künyesinde).

  ── SATIŞ YERİ GİRİŞTE BELLİ OLUR VE YIĞIN BOYUNCA DEĞİŞMEZ (01.09) ─────────
  Kurye günü buraya `?place=van` ile gelir, depo hub'ı parametresiz. Yer bir kez okunup DURUMA
  alınıyor; sonraki adreslerde (`/sale/cart`, `/sale/receipt`, `/sale/history`) parametre yok ve
  her adrese elle taşınsaydı taşımayı unutan tek ekran satışı sessizce yanlış depoya yazardı —
  düzelttiğimiz arızanın ta kendisi.

  Yığın kapanınca durum da gider: geri dönüp Depo sekmesinden girildiğinde yer yeniden adresten
  okunur.
*/
export default function SaleLayout() {
  const { place } = useGlobalSearchParams<{ place?: string }>();
  const [entry] = useState<SalePlace>(() => {
    const parsed = SalePlaceEnum.safeParse(place);
    return parsed.success ? parsed.data : 'facility';
  });

  return (
    <SaleProvider place={entry}>
      <Stack screenOptions={{ headerShown: false }} />
    </SaleProvider>
  );
}
