import { useLocalSearchParams } from 'expo-router';

import { PackageDetailScreen } from '@/screens/package/package-detail-screen';

/*
  PAKET DETAY ROTASI — ekran gerçek uçtan okur (`GET /api/v1/packages/:slug`), tasarım ve
  sapmaları ekranın künyesinde. Vitrinin "Hazır paketler" kartı buraya gerçek slug'la gelir.

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): yığına girildiğinde sekme çubuğu gizlenir
  (envanter §4) — ürün detayı rotasının aynı kararı. `key` GEREKMEZ: ürün detayındaki aile
  çiplerinin `setParams` oyunu burada yok, slug ekran ömrü boyunca sabittir.
*/
export default function PackageRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <PackageDetailScreen slug={typeof slug === 'string' ? slug : ''} />;
}
