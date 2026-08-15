import Svg, { Path } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

/*
  GERİ BİLDİRİM EKRANININ İKİ İKONU — v3 vFb'den birebir (v3:1026-1027 başparmak, v3:1035 kalp).
  İkisi de ikon sözlüklerinde YOK (`components/ui/icon-paths.ts` + `customer-kit/customer-icon.tsx`)
  ve bu etapta iki dosya da YAZIYA KAPALI — o yüzden `CustomerIcon`un kendi gerekçesiyle ekranın
  yanında duruyorlar: sözlük yazıya açıldığı gün geometriler oraya terfi eder, bu dosya silinir
  (ihtiyaç raporlandı). Çizim davranışı kitin kurallarıdır: renk çağırandan (ham hex yok), ikon
  sessiz (yanındaki metin konuşur), çizgi kalınlığı temadan.
*/

/** Başparmak — şablonun tek geometrisi; "beğenmedim" AYNI yolun 180° dönmüş hâlidir (v3:1026). */
const THUMB_PATH =
  'M7 11v9H4v-9h3zm3 9h7.5a2 2 0 0 0 2-1.6l1.3-6A2 2 0 0 0 18.8 10H14l.8-4.2A1.8 1.8 0 0 0 11.3 4L8 10.5V20z';

/** Kalp — teşekkür dairesinin DOLU ikonu; şablon burada çizgi değil dolgu kullanıyor (v3:1035). */
const HEART_PATH =
  'M12 20.5C6 15.5 3 12.3 3 8.8 3 6.2 5 4.5 7.3 4.5c1.8 0 3.4 1 4.7 2.7 1.3-1.7 2.9-2.7 4.7-2.7C19 4.5 21 6.2 21 8.8c0 3.5-3 6.7-9 11.7z';

/**
 * Puan yıldızı (✦) — sonuç sayfasının KAHRAMAN işareti (kullanıcı kararı 15.08).
 *
 * Şablonda YOK ve bilinçli bir sapma: tasarım orada kalp kullanıyordu (v3:1035), ama o kalp
 * kartlı yerleşimin küçük rozetiydi. Kutu kalkıp sayfa bütünleşince işaret büyüdü ve kalbin
 * jenerikliği ortaya çıktı — anın konusu "beğeni" değil PUAN. `✦` uygulamanın puan dilinin
 * kendisi: hesap kartı `✦ 10`, sonuç satırı `✦ +15 puan` diye yazıyor. İşaret artık o metinlerle
 * aynı şeyi söylüyor.
 *
 * Geometri: (12,12) merkezli dört uçlu yıldız; kenarlar merkeze doğru İÇBÜKEY, yani uçlar sivri.
 * Düz bir baklava (rhombus) değil — dolu bir eşkenar dörtgen büyük ölçekte ağır durur.
 */
const SPARK_PATH =
  'M12 2c.6 5.2 4.2 8.8 9.4 9.4C16.2 12 12.6 16.2 12 22c-.6-5.8-4.2-10-9.4-10.6C7.8 10.8 11.4 7.2 12 2z';

interface ThumbIconProps {
  /** `up` beğendim, `down` beğenmedim — şablon ikinciyi `transform="rotate(180)"` ile çeviriyor. */
  direction: 'up' | 'down';
  /** Kenar uzunluğu (dp). */
  size: number;
  /** Tema renk token'ının değeri. */
  color: string;
}

export function ThumbIcon({ direction, size, color }: ThumbIconProps) {
  const { theme } = useUnistyles();

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={theme.border.iconStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={direction === 'down' ? { transform: [{ rotate: '180deg' }] } : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={THUMB_PATH} />
    </Svg>
  );
}

interface HeartIconProps {
  size: number;
  /** Dolgunun rengi — tema token'ı (şablonda zeytin). */
  color: string;
}

export function HeartIcon({ size, color }: HeartIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={HEART_PATH} fill={color} />
    </Svg>
  );
}

/** Puan yıldızı — `HeartIcon` ile aynı sözleşme (dolu geometri, renk çağırandan). */
export function SparkIcon({ size, color }: HeartIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={SPARK_PATH} fill={color} />
    </Svg>
  );
}
