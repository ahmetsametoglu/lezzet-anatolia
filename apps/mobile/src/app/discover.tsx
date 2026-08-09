import { DiscoverScreen } from '@/screens/discover/discover-screen';
import { useMe } from '@/screens/customer-kit/use-me.hook';

/*
  KEŞİF ROTASI — vitrinin kesikli davet kutusu ve hesap kartının "puan kazanma yolları" satırı
  buraya basar. Rota dosyası İNCE (katalog/hesap rotalarının deseni): ekranın parçaları
  `src/screens/discover/`ta.

  KİMLİK BURADA ÇÖZÜLÜR (hesap rotasının aynı kararı): tur GİRİŞSİZ de dönebilir — web'in açık
  kararı (*"giriş duvarı koymak sinyali de dönüşümü de kaybettirirdi"*) ve v3 de bitişte misafire
  giriş daveti gösteriyor. Ekran yalnız "girişli miyim"i bilir; puan vaadini oradan kendi okur.

  Kısa yükleme anında hiçbir hâl İDDİA EDİLMEZ: `loading` bittikten sonra çizilir, yoksa misafir
  daveti bir kare yanıp sönerdi (hesap sekmesinin dersi).
*/
export default function DiscoverRoute() {
  const meState = useMe();
  if (meState.status === 'loading') return null;
  return <DiscoverScreen signedIn={meState.status === 'ready'} />;
}
