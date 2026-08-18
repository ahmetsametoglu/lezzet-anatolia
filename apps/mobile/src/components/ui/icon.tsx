import Svg, { Circle, Path } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

import { ICON_PATHS, type IconName } from './icon-paths';

/*
  İKON — kitin tek çizim kapısı (21.7). Geometri `icon-paths.ts`te (v3 tasarımından birebir),
  burada yalnız ÇİZİM DAVRANIŞI var: boy, renk, çizgi kalınlığı, uç biçimi.

  NEDEN `react-native-svg`: tasarımın ikonları yol (path) olarak yazılı; RN'de yolu çizen başka
  bir yol yok. Yerel modüldür — dev-client'ın yeniden derlenmesi gerekir (rapor edildi).

  RENK ÇAĞIRANDAN, HAM DEĞİL: `color` prop'u tema token'ı bekler. Web'in `currentColor` kalıbının
  RN karşılığı yoktur (RN metin rengini SVG'ye miras vermez), o yüzden renk açıkça geçirilir —
  varsayılan mürekkeptir, yani renk vermeyen çağıran da paletin içinde kalır.

  ÇİZGİ KALINLIĞI BOYA BAĞLI: şablon büyük ikonlarda (34 dp ve üstü boş/hata bloğu) çizgiyi
  inceltiyor — optik ağırlık boyla birlikte artmasın diye. Kural sözlükte `large` bayrağıyla
  duruyor; komponent onu kalınlık durağına çevirir, çağıran hesap yapmaz.

  ERİŞİLEBİLİRLİK: ikon VARSAYILAN OLARAK SESSİZDİR (`accessibilityElementsHidden`). Kitteki
  kullanımların hepsinde ikonun yanında metin var (sekme etiketi, boş durum başlığı, arama
  kutusunun kendi etiketi); ikonu ayrıca okutmak ekran okuyucuda aynı bilgiyi iki kez söyletirdi.
  Metinsiz bir ikon düğmesi gerektiğinde ETİKET DÜĞMENİN üstünde durur (`PressableSurface`in
  `accessibilityLabel`ı), ikonun kendisinde değil.
*/

interface IconProps {
  name: IconName;
  /** Kenar uzunluğu (dp) — kare olmayan ikonda YÜKSEKLİK; genişlik `viewBox` oranından türer. */
  size: number;
  /** Tema renk token'ının değeri; verilmezse mürekkep. */
  color?: string;
  /**
   * Çizgiyi VURGULU durağa alır (`iconStrokeBold`). Ham kalınlık prop'u BİLEREK yok: sayı
   * verilebilseydi çağıranlar ölçeğin dışına çıkardı ve ikonlar birbirinden habersiz kalınlaşırdı.
   * Ölçü değil ROL seçiliyor — "bu ikon bir eylemin kendisi, satır içi bir işaret değil".
   */
  bold?: boolean;
  testID?: string;
}

/** Şablonun varsayılan çizim kutusu — `IC` sözlüğündeki ikonların hepsi 24×24. */
const DEFAULT_VIEW_BOX = '0 0 24 24';

/** `"0 0 19 17"` → `[19, 17]`. Kare olmayan kutuda genişliği yükseklikten türetmek için. */
function viewBoxRatio(viewBox: string): number {
  const [, , width, height] = viewBox.split(' ').map(Number);
  return width === undefined || height === undefined || height === 0 ? 1 : width / height;
}

export function Icon({ name, size, color, bold = false, testID }: IconProps) {
  const { theme } = useUnistyles();
  const geometry: (typeof ICON_PATHS)[IconName] = ICON_PATHS[name];
  const viewBox = 'viewBox' in geometry && geometry.viewBox !== undefined ? geometry.viewBox : DEFAULT_VIEW_BOX;
  const stroke = color ?? theme.colors.ink;
  /* Sıra anlamlı: VURGU boy kuralını ezer. `large` geometrisi "büyük ikon ince çizilir" der ve
     optik ağırlığı sabit tutar; `bold` ise "bu ikon bir eylem" der ve ağırlığı BİLEREK artırır. */
  const strokeWidth = bold
    ? theme.border.iconStrokeBold
    : 'large' in geometry
      ? theme.border.iconStrokeLarge
      : theme.border.iconStroke;

  return (
    <Svg
      width={size * viewBoxRatio(viewBox)}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      /* Şablonun her ikonunda yuvarlak uç/köşe var — çizgi ikonlarının imzası budur ve
         eksikliği köşelerde tırnak gibi görünür. Tek yerde, ikon başına tekrar edilmez. */
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {geometry.paths.map((d) => (
        <Path key={d} d={d} />
      ))}
      {'circles' in geometry
        ? geometry.circles.map(([cx, cy, r]) => <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />)
        : null}
    </Svg>
  );
}
