import { useLocalSearchParams } from 'expo-router';

import { RecipeDetailScreen } from '@/screens/recipe/recipe-detail-screen';

/*
  TARİF DETAY ROTASI — ekran gerçek uçtan okur (`GET /api/v1/recipes/:slug`); tasarım ve
  sapmaları ekranın künyesinde. Vitrinin "Sofradan fikirler" kartı buraya gerçek slug'la basar.

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): yığına girildiğinde sekme çubuğu gizlenir
  (envanter §4) — ürün rotasının aynı kararı. Ürün rotasındaki `key={slug}` burada YOK: tarifin
  aile-çipi gibi slug'ı yerinde değiştiren bir etkileşimi yok, ekran rota başına bir kez kurulur.
*/
export default function RecipeRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <RecipeDetailScreen slug={typeof slug === 'string' ? slug : ''} />;
}
