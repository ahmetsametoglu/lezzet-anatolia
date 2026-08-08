import { useLocalSearchParams } from 'expo-router';

import { ScreenPlaceholder } from '@/components/screen-placeholder';

/*
  PAKET DETAY — bugün YER TUTUCU (kendi dilimi 21.14'ün sonraki turunda: paket içeriği listesi,
  adet sayacı + "sepete ekle" yapışkan barı). Rota vitrinin hazır paket kartı için var.
*/
export default function PackageRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <ScreenPlaceholder title={slug} />;
}
