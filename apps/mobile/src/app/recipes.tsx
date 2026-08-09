import { RecipesListScreen } from '@/screens/recipes-list/recipes-list-screen';

/*
  TARİFLER — SEKME DEĞİL, YIĞIN ekranı (v3:903 `vRecipes`): tasarımın başlık satırı geri okuyla
  başlıyor ve sekme çubuğu yığında gizleniyor (`tabsVisible = !top`). Vitrindeki "Sofradan
  Fikirler" şeridinin sonundaki "Tümünü gör" kartı buraya açılır.

  Rota dosyası İNCE (katalogla aynı gerekçe) — ekranın parçaları `src/screens/recipes-list/`ta.
*/
export default function RecipesRoute() {
  return <RecipesListScreen />;
}
