import { HomeScreen } from '@/screens/home/home-screen';

/*
  Rota dosyası İNCE (katalogla aynı gerekçe): expo-router bu klasördeki her `.tsx`i bir ROTA sayar,
  o yüzden vitrinin parçaları (görünüm · bantlar · metinler · fixture) `src/screens/home/`ta yaşar.
*/
export default function HomeRoute() {
  return <HomeScreen />;
}
