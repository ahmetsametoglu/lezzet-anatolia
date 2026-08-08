import { OperationsSectionScreen } from '@/screens/operations/section-screen';

/*
  Rota dosyası İNCE (müşteri kabuğuyla aynı kural): expo-router bu klasördeki her `.tsx`i bir ROTA
  sayar, o yüzden ekranın parçaları `src/screens/operations/`ta yaşar. Dört bölüm aynı komponenti
  çağırır ve YALNIZ hangi bölüm olduklarını söyler — kabukta dördü de aynı iskelettir.
*/
export default function CourierRoute() {
  return <OperationsSectionScreen section="courier" />;
}
