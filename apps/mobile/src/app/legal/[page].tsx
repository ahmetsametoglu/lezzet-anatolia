import { useLocalSearchParams } from 'expo-router';

import { LegalScreen } from '@/screens/legal/legal-screen';

/*
  BİLGİ SAYFALARI (teslimat & iade · SSS · gizlilik · satış koşulları · yasal bilgiler) — TEK rota,
  beş belge. Anahtar YOLDA taşınır; ekran tanımadığı anahtarda "bu sayfa yok" bloğunu çizer.
  Çağıranlar: giriş ekranının gizlilik bağı, hesap menüsü, checkout ve sipariş detayı.
*/
export default function LegalRoute() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return <LegalScreen page={page} />;
}
