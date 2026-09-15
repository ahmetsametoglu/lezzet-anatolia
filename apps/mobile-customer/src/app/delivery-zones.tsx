import { DeliveryZonesScreen } from '@/screens/delivery-zones/delivery-zones-screen';

/*
  TESLİMAT BÖLGELERİ — "siz nereye gidiyorsunuz?" sayfası (kullanıcı kararı 10.08). Çağıranı
  bölge dışı bilgi bandıdır (katalog · paketler listesi); yığında açılır, sekme değildir.
  Bölge adları uçtan gelir (`GET /api/v1/places/zones`) — künye ekranın kendisinde.
*/
export default function DeliveryZonesRoute() {
  return <DeliveryZonesScreen />;
}
