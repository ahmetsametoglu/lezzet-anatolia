import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

import { ICON_PATHS, type IconName } from '@lezzet/design-tokens/icons';

/*
  İkon çizicisi: geometri `@lezzet/design-tokens/icons`ta, burada yalnız çizim davranışı var (boy, renk, çizgi kalınlığı, uç). Renk
  açıkça geçirilir, çünkü RN metin rengini SVG'ye miras vermez; ikon varsayılan olarak sessizdir, çünkü yanında hep aynı şeyi
  söyleyen bir metin ya da düğme etiketi vardır.
*/

interface IconProps {
  name: IconName;
  /** Kenar uzunluğu (dp) — kare olmayan ikonda YÜKSEKLİK; genişlik `viewBox` oranından türer. */
  size: number;
  /** Tema renk token'ının değeri; verilmezse mürekkep. */
  color?: string;
  /**
   * Çizgiyi vurgulu durağa alır (`iconStrokeBold`); ham kalınlık prop'u bilerek yok, çünkü sayı verilebilseydi çağıranlar ölçeğin
   * dışına çıkardı. Ölçü değil rol seçilir: bu ikon bir eylemin kendisi, satır içi bir işaret değil.
   */
  bold?: boolean;
  testID?: string;
}

/** Varsayılan çizim kutusu; kare olmayan ikon kendi `viewBox`unu taşır. */
const DEFAULT_VIEW_BOX = '0 0 24 24';

/** `"0 0 19 17"` → 19/17: kare olmayan kutuda genişliği yükseklikten türetmek için. */
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
      {'rects' in geometry
        ? geometry.rects.map(([x, y, width, height, rx]) => (
            <Rect key={`${x}-${y}-${width}-${height}`} x={x} y={y} width={width} height={height} rx={rx} />
          ))
        : null}
    </Svg>
  );
}
