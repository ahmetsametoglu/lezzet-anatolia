import { useLocalSearchParams } from 'expo-router';

import { LegalScreen } from '@/screens/legal/legal-screen';

/*
  BİLGİ SAYFALARI (teslimat & iade · SSS · gizlilik · satış koşulları · yasal bilgiler) — TEK rota,
  beş belge. Anahtar YOLDA taşınır; ekran tanımadığı anahtarda "bu sayfa yok" bloğunu çizer.
  Çağıranlar (ölçüldü 19.08, künye bayattı — "sipariş detayı" çoktan `/support`a geçmişti):
  hesap ekranının BİLGİ BLOĞU (beş belgenin tamamı, misafirde de girişlide de), hesap menüsünün
  teslimat kısayolu, veri kartının gizlilik bağı, giriş ekranının gizlilik bağı, checkout'un satış
  koşulları satırı ve sayfaların kendi çıkış bantları.
*/
export default function LegalRoute() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return <LegalScreen page={page} />;
}
