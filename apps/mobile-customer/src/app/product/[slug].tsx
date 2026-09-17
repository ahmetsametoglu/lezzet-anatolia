import { useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/screens/product/product-detail-screen';

/*
  Ürün detay rotası sekme kabuğunun dışında, kök yığında durur: tasarımda ürüne girilince sekme çubuğu gizlenir. `key={slug}`,
  aile çipi slug'ı yerinde değiştirdiğinde ekranı yeniden kurar ki boy, adet ve akordeon seçimi yeni ürüne taşınmasın.
*/
export default function ProductRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const key = typeof slug === 'string' ? slug : '';
  return <ProductDetailScreen key={key} slug={key} />;
}
