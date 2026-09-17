import { useLocalSearchParams } from 'expo-router';

import { ProductDetailScreen } from '@/screens/product/product-detail-screen';

/*
  Ürün detay rotası sekme kabuğunun dışında, kök yığında durur: tasarımda ürüne girilince sekme çubuğu gizlenir. `key={slug}`,
  aile çipi slug'ı yerinde değiştirdiğinde ekranı yeniden kurar ki boy, adet ve akordeon seçimi yeni ürüne taşınmasın.
*/
export default function ProductRoute() {
  const { slug, variant } = useLocalSearchParams<{ slug: string; variant?: string }>();
  const key = typeof slug === 'string' ? slug : '';
  // `variant` paket kaleminin boyu; aile çipiyle başka ürüne geçilince eşleşmez ve ekran kartın boyuna düşer.
  return <ProductDetailScreen key={key} slug={key} initialVariantId={typeof variant === 'string' ? variant : null} />;
}
