import { useLocalSearchParams } from 'expo-router';

import { CourierDeliveryScreen } from '@/screens/courier/delivery-screen';

/*
  KAPIDAKİ TESLİMAT — `/delivery/:orderId`.

  `(sections)` grubunun DIŞINDA, `(operations)` yığınının doğrudan altında: bölüm sekmeleri yalnız
  bölüm KÖKLERİNDE çizilir (v2:1097 `tabsVisible: isRoot && …`) ve dosya düzeni bunu kendiliğinden
  veriyor — `(sections)`in dışındaki her rota sekme çubuğu olmadan açılır (bildirim ekranıyla aynı
  kalıp). Yığında da olduğu için sistem geri hareketi durak listesine döner.

  Yol segmenti İNGİLİZCE (CLAUDE §2): operasyon yüzeyi öneksizdir ama adres yine İngilizce.
*/
export default function DeliveryRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <CourierDeliveryScreen orderId={orderId} />;
}
