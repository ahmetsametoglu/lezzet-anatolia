import { useLocalSearchParams } from 'expo-router';

import { CourierDayCloseScreen } from '@/screens/courier/day-close-screen';

/*
  GÜN KAPANIŞI — `/day-close`. Teslimat ekranıyla aynı gerekçeyle `(sections)` DIŞINDA: yığına
  girilince sekme çubuğu gizlenir (v2'nin kuralı), geri hareketi durak listesine döner.

  ── HANGİ SEFER KAPANIYOR: EKRAN SÖYLER, SUNUCU TAHMİN ETMEZ (01.09) ────────
  Adres `runId` taşımıyordu ve taslak isteği kimliksiz gidiyordu; sunucu da "kapanmamış ilk sefer"i
  seçiyordu. İki seferli günde bu YANLIŞ kaydı açıyordu (cihazda ölçüldü: kurye Doğu Hattı'nı
  sürerken ekran Batı Hattı'nın mutabakatını açtı). Yazma ucu bu kuralı zaten uyguluyordu
  (`POST /day-close` `runId` ZORUNLU istiyor); okuma da aynı hizaya geldi.

  Parametre YOKSA sunucunun çözümü yedek kalır (sürülen sefer) — derin bağlantı ya da eski bir
  yığın kimliksiz gelebilir ve ekranın boş açılması doğru cevap olmazdı.
*/
export default function DayCloseRoute() {
  const { runId } = useLocalSearchParams<{ runId?: string }>();
  return <CourierDayCloseScreen runId={typeof runId === 'string' ? runId : undefined} />;
}
