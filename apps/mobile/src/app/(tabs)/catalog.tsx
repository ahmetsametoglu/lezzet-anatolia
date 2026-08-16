import { useLocalSearchParams } from 'expo-router';

import { CatalogScreen } from '@/screens/catalog/catalog-screen';

/*
  Rota dosyası İNCE tutulur: expo-router bu klasördeki her `.tsx`i bir ROTA sayar, dolayısıyla
  ekranın parçaları (görünüm · hook · metinler) burada değil `src/screens/catalog/`ta yaşar —
  yan yana koysaydık `catalog-screen` de bir adres olurdu.

  `category` ve `collection` parametreleri vitrin bantlarından gelir (21.14b · 21.64): bant
  kataloğu O süzgeçle açar. Parametre yalnız BİR SEÇİM iletir — süzgecin sahibi yine katalog
  ekranıdır (müşteri sonrasında çipten değiştirebilir, koleksiyonu bandın çarpısıyla kapatabilir).

  İkisi AYRI eksen: bir bandın türü ya kategori ya koleksiyondur (`HomeBandKindEnum`), yani vitrin
  ikisini birden göndermez — ama ekran ikisinin birlikte açık olmasına izin verir, çünkü müşteri
  kesitin içindeyken çipten daraltabiliyor.
*/
/* BOŞ DİZE DE "istek yok" demektir: ekran uygulanan isteği `setParams`la siliyor (künyesi orada) ve
   silinen bir parametrenin `undefined` mi boş dize mi olarak döndüğü router'ın kendi ayrıntısı.
   Boşu slug sanıp uca göndermek 400 (`unknown_collection`) getirirdi. */
const requested = (value: string | undefined): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export default function CatalogRoute() {
  const { category, collection } = useLocalSearchParams<{ category?: string; collection?: string }>();
  return <CatalogScreen requestedCategory={requested(category)} requestedCollection={requested(collection)} />;
}
