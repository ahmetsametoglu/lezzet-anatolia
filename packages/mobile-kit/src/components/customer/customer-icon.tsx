import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';
import { CUSTOMER_ICON_PATHS } from '@lezzet/design-tokens/icons';

/*
  MÜŞTERİ EKRANLARININ İKON TAMAMLAYICISI — v3'ün müşteri ekranlarında geçen ama paylaşılan kitin
  sözlüğünde HENÜZ OLMAYAN geometrilerin ÇİZİCİSİ. Geometrinin kendisi `@lezzet/design-tokens/icons`ta
  (`CUSTOMER_ICON_PATHS`; 14.09'da `brand`e, 15.09'da tasarım token'larının yanına taşındı): müşterinin
  telefon tasarımı uygulamada ve web telefon görünümünde aynı, ikon verisi iki yüzeyin ortak ve
  platformdan bağımsız kısmında.

  NEDEN BURADA, KİTTE DEĞİL (21.14'ün açık kısıtı): bu etapta `components/ui` YAZIYA KAPALI —
  operasyon ekranları aynı dosyalarda paralel çalışıyor. İhtiyaç yöneticiye raporlandı; sözlük
  kite terfi ettiği gün bu dosya SİLİNİR ve çağıranlar `Icon`a döner.

  ÇİZİM DAVRANIŞI kitin `Icon`u ile AYNI kuralları izler (renk çağırandan, çizgi kalınlığı boya
  bağlı, ikon varsayılan olarak sessiz) — o kuralların ikinci bir yorumu YAZILMADI, aynen
  uygulandı. Ham renk yok: varsayılan mürekkep temadan gelir.
*/

// Dışarıya İHRAÇ EDİLMEZ (knip): bugün tek tüketen bu dosyanın props'u; ilk dış çağıran çıkınca açılır.
type CustomerIconName = keyof typeof CUSTOMER_ICON_PATHS;

/** Kitin varsayılan çizim kutusuyla aynı. */
const DEFAULT_VIEW_BOX = '0 0 24 24';

/** `"0 0 24 19"` → `24/19`. Kare olmayan kutuda genişliği yükseklikten türetir. */
function viewBoxRatio(viewBox: string): number {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return width === undefined || height === undefined || height === 0 ? 1 : width / height;
}

interface CustomerIconProps {
  name: CustomerIconName;
  /** Kenar uzunluğu (dp) — kare olmayan ikonda YÜKSEKLİK. */
  size: number;
  /** Tema renk token'ının değeri; verilmezse mürekkep. */
  color?: string;
  testID?: string;
}

export function CustomerIcon({ name, size, color, testID }: CustomerIconProps) {
  const { theme } = useUnistyles();
  const geometry: (typeof CUSTOMER_ICON_PATHS)[CustomerIconName] = CUSTOMER_ICON_PATHS[name];
  const viewBox = 'viewBox' in geometry && geometry.viewBox !== undefined ? geometry.viewBox : DEFAULT_VIEW_BOX;

  return (
    <Svg
      width={size * viewBoxRatio(viewBox)}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color ?? theme.colors.ink}
      strokeWidth={'large' in geometry ? theme.border.iconStrokeLarge : theme.border.iconStroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      testID={testID}
      // İkon SESSİZDİR: yanındaki metin ya da düğmenin kendi etiketi konuşur (kitin kuralı).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Daralma `in` ile: sözlük SABİT olduğu için her ad kendi alanlarını taşır ve isteğe bağlı
          alanlar birleşimin yalnız bazı üyelerinde vardır (kitteki `Icon`un `large` kalıbı). */}
      {'paths' in geometry
        ? geometry.paths.map((d) => <Path key={d} d={d} />)
        : null}
      {'circles' in geometry
        ? geometry.circles.map(([cx, cy, r]) => <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />)
        : null}
      {'rects' in geometry
        ? geometry.rects.map(([x, y, width, height, rx]) => (
            <Rect key={`${x}-${y}-${width}-${height}`} x={x} y={y} width={width} height={height} rx={rx} />
          ))
        : null}
    </Svg>
  );
}
