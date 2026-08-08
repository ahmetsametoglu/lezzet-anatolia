import { useLocalSearchParams } from 'expo-router';

import { ScreenPlaceholder } from '@/components/screen-placeholder';

/*
  BİLGİ SAYFALARI (gizlilik · teslimat · satış koşulları · SSS) — bugün YER TUTUCU; içerik web
  yüzeyinde yaşıyor ve uygulamaya taşınması kendi dilimi. Rota giriş ekranının gizlilik
  bağlantısı ve hesap ekranındaki bilgi satırları için var.
*/
export default function LegalRoute() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return <ScreenPlaceholder title={page} />;
}
