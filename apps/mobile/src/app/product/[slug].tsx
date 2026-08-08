import { useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/screens/product/product-detail-screen';

/*
  ÜRÜN DETAY ROTASI — ekran gerçek uçtan okur (`GET /api/v1/products/:slug`), tasarım ve
  sapmaları ekranın künyesinde.

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): tasarımda yığına girildiğinde sekme çubuğu
  gizleniyor (envanter §4) — dosyanın `(tabs)` grubunda olmaması tam olarak bunu sağlıyor.

  `key={slug}`: aile çipleri slug'ı `setParams`la YERİNDE değiştirir (yığına sayfa eklenmez —
  kullanıcı kararı 08.08); ekranın seçim durumu (boy/adet/akordeon) yeni ürüne taşınmasın diye
  ürün değişince ekran anahtarıyla yeniden kurulur.
*/
export default function ProductRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const key = typeof slug === 'string' ? slug : '';
  return <ProductDetailScreen key={key} slug={key} />;
}
