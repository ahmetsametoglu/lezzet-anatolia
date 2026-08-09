import { useLocalSearchParams } from 'expo-router';

import { CatalogScreen } from '@/screens/catalog/catalog-screen';

/*
  Rota dosyası İNCE tutulur: expo-router bu klasördeki her `.tsx`i bir ROTA sayar, dolayısıyla
  ekranın parçaları (görünüm · hook · metinler) burada değil `src/screens/catalog/`ta yaşar —
  yan yana koysaydık `catalog-screen` de bir adres olurdu.

  `category` parametresi vitrin bantlarından gelir (21.14b): kategori bandı kataloğu O süzgeçle
  açar. Parametre yalnız BİR SEÇİM iletir — süzgecin sahibi yine katalog ekranıdır (müşteri
  sonrasında çipten değiştirebilir).
*/
export default function CatalogRoute() {
  const { category } = useLocalSearchParams<{ category?: string }>();
  return <CatalogScreen requestedCategory={typeof category === 'string' ? category : null} />;
}
