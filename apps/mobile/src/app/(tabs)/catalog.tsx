import { CatalogScreen } from '@/screens/catalog/catalog-screen';

/*
  Rota dosyası İNCE tutulur: expo-router bu klasördeki her `.tsx`i bir ROTA sayar, dolayısıyla
  ekranın parçaları (görünüm · hook · metinler) burada değil `src/screens/catalog/`ta yaşar —
  yan yana koysaydık `catalog-screen` de bir adres olurdu.
*/
export default function CatalogRoute() {
  return <CatalogScreen />;
}
