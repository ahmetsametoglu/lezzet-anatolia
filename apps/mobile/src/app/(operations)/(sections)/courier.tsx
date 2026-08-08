import { CourierDayScreen } from '@/screens/courier/courier-day-screen';

/*
  Rota dosyası İNCE (müşteri kabuğuyla aynı kural): expo-router bu klasördeki her `.tsx`i bir ROTA
  sayar, o yüzden ekranın parçaları `src/screens/`te yaşar.

  Kurye artık ORTAK bölüm ekranını (`OperationsSectionScreen`) kullanMIYOR: kabuk diliminin (21.9)
  künyesinde yazdığı gibi dört bölümün TEPESİ aynı, GÖVDESİ farklı — kurye gövdesi geldi (21.10).
  Üstbaşlık + Lora başlık + zil üçlüsü hâlâ aynı komponentten (`OperationsSectionHeader`), yani
  ortaklık kaybolmadı; ayrışan yalnız gövde. Depo · Yönetim · Para hâlâ ortak ekranda.
*/
export default function CourierRoute() {
  return <CourierDayScreen />;
}
