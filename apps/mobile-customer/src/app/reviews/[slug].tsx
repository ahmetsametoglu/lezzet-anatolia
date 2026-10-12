import { useLocalSearchParams } from 'expo-router';

import { ProductReviewsScreen } from '@/screens/product/product-reviews-screen';

/* Tüm yorumlar ekranı ürün sayfası gibi kök yığında durur ve sekme çubuğunu gizler; geri, ürün sayfasına döner. */
export default function ProductReviewsRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ProductReviewsScreen slug={typeof slug === 'string' ? slug : ''} />;
}
