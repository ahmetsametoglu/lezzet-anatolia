import { useEffect } from 'react';
import { useNavigation } from 'expo-router';
import { BackHandler } from 'react-native';

/*
  DONANIM GERİSİ EKRANIN GERİSİYLE AYNI ŞEYİ YAPAR (kullanıcı bulgusu 03.09).

  ── ÖLÇÜLEN AYRIŞMA ─────────────────────────────────────────────────────────
  Sayım ve düşüm ekranlarının sol üstündeki geri oku iki HÂLİ ayırıyor: parti seçiliyken bir adım
  geri (seçiciye dön), seçili değilken ekranı terk et (`21.220`'nin kuyruk kuralı). Cihazın kendi
  geri tuşu bunu bilmiyordu — expo-router doğrudan rotayı geri alıyor ve depocu partiyi seçtikten
  sonra tek dokunuşla DEPO HUB'INA düşüyordu. Kullanıcının cümlesi: *"cihazın kendi geri tuşunu
  kullandığım zaman depo ekranına geri gidiyorum."*

  Aynı ekranda iki geri tuşunun iki ayrı şey yapması bir tutarsızlıktır: depocu hangisine bastığına
  göre başka yere gider ve bunu ancak deneyerek öğrenir.

  ── NİÇİN KİTTE DEĞİL, BURADA ───────────────────────────────────────────────
  Kural ekranın kendi hâline bağlı ("konu seçili mi") ve o hâli yalnız ekran biliyor. Kitteki
  `BottomSheet` kendi geri kaydını ZATEN tutuyor (açık çekmece önce kapanır) ve sıra doğru: RN
  dinleyicileri SON eklenen önce çağırır, yani üstteki çekmece geriyi tüketir, ekran görmez.
*/

/**
 * @param active Kancanın kapıyı tutup tutmayacağı — `false` iken donanım gerisi normal davranır
 *   (ekranı terk eder). Konusu seçilmemiş ekran `false` verir.
 * @param onBack Konuyu bırakma; ekranın sol üstteki okla AYNI çağrısı.
 */
export function useSubjectBack(active: boolean, onBack: () => void): void {
  const navigation = useNavigation();

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      // `true` = olayı TÜKETTİM: rota geri gitmez, ekran kendi bir adımını atar.
      return true;
    });
    return () => subscription.remove();
  }, [active, onBack]);

  /*
    iOS'UN KENARDAN KAYDIRMASI: KONU SEÇİLİYKEN KAPALI (kullanıcı bulgusu 04.09, iki adımda).

    İlk deneme `beforeRemove` + `preventDefault` idi ve iOS'ta ÇÖKTÜ: *"The screen 'inbound' was
    removed from js state…"*. Native yığında (react-native-screens) kaydırma jesti tamamlandığı
    anda ekranı native tarafta kaldırıyor; JS'in kaldırmayı iptal etmesi iki durumu ayrıştırıyor.
    React Navigation'ın kendi belgesi de aynı şeyi söyler: native-stack'te jestle kapanış
    `beforeRemove` ile durdurulamaz. Doğru araç jesti hiç BAŞLATMAMAK: konu seçiliyken
    `gestureEnabled: false`, bırakılınca yeniden açık. Depocu detaydayken kaydırırsa hiçbir şey
    olmaz; geri, başlık okuyla ya da Android'in tuşuyla atılan tek adımdır — iki yol da listeye.
    Konu seçili değilken kaydırma normal davranır (ekranı terk eder).
  */
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !active });
  }, [active, navigation]);
}
