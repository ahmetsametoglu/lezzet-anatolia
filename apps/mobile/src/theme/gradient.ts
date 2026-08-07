/*
  Gradyan çevirisi — TEK YER. `customerAppGradient` değerleri CSS dizgesidir
  ("linear-gradient(180deg, rgba(…) , rgba(…) 32%)"); expo-linear-gradient ise renk + durak
  DİZİSİ ve başlangıç/bitiş noktası ister. Çeviri burada yapılır ve `LinearGradientProps`
  sözleşmesine bağlanır: tüketicinin beklediği alan adları derleme zamanında doğrulanır,
  "renkler doğru ama prop adı yanlış" sınıfı bir hata mümkün olmaz.

  Desteklenen biçim tasarımın kullandığı biçimdir: açı `<n>deg` + iki ya da daha çok renk
  durağı. Tanınmayan dizge SESSİZCE düz renge düşmez, FIRLATIR — bozuk bir gradyan çalışma
  zamanında "gradyan yok" diye görünür ve kimse fark etmezdi.
*/
import type { LinearGradientProps } from 'expo-linear-gradient';

/** expo-linear-gradient'e doğrudan yayılan prop kümesi (`<LinearGradient {...props} />`). */
type GradientProps = Pick<LinearGradientProps, 'colors' | 'locations' | 'start' | 'end'>;

const GRADIENT_PATTERN = /^linear-gradient\((.*)\)$/s;
const ANGLE_PATTERN = /^(-?[\d.]+)deg$/;
const STOP_WITH_POSITION = /^(.+?)\s+(-?[\d.]+)%$/;

/** Üst düzey virgülle böler — `rgba(21, 23, 15, 0.28)` içindeki virgüller korunur. */
const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts;
};

const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Durak yeri yazılmamış renkler doldurulur: ilki 0, sonuncusu 1, aradakiler bilinen iki komşu
 * arasında eşit aralıklı. CSS'in kendi kuralı da budur; tasarımdaki iki gradyanda yalnız uç
 * duraklar eksik.
 */
const fillLocations = (positions: Array<number | null>): number[] => {
  const filled = [...positions];
  if (filled[0] === null) filled[0] = 0;
  if (filled[filled.length - 1] === null) filled[filled.length - 1] = 1;

  for (let index = 1; index < filled.length - 1; index += 1) {
    if (filled[index] !== null) continue;
    let next = index;
    while (filled[next] === null) next += 1;
    const previous = filled[index - 1] as number;
    const step = ((filled[next] as number) - previous) / (next - index + 1);
    filled[index] = round(previous + step);
  }

  return filled as number[];
};

/** CSS açısı → expo-linear-gradient başlangıç/bitiş noktası. 0deg yukarı, 90deg sağa, 180deg aşağı. */
const anglePoints = (degrees: number): Pick<GradientProps, 'start' | 'end'> => {
  const radians = (degrees * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  return {
    start: { x: round(0.5 - dx / 2), y: round(0.5 - dy / 2) },
    end: { x: round(0.5 + dx / 2), y: round(0.5 + dy / 2) },
  };
};

export const parseLinearGradient = (css: string): GradientProps => {
  const inner = GRADIENT_PATTERN.exec(css.trim())?.[1];
  if (!inner) throw new Error(`Gradyan token'ı "linear-gradient(...)" biçiminde değil: ${css}`);

  const [head, ...stops] = splitTopLevel(inner);
  const angle = ANGLE_PATTERN.exec(head ?? '')?.[1];
  if (angle === undefined) throw new Error(`Gradyan açısı "<n>deg" biçiminde değil: ${head}`);
  if (stops.length < 2) throw new Error(`Gradyan en az iki renk durağı ister: ${css}`);

  const colors: string[] = [];
  const positions: Array<number | null> = [];
  for (const stop of stops) {
    const withPosition = STOP_WITH_POSITION.exec(stop);
    colors.push(withPosition ? (withPosition[1] as string) : stop);
    positions.push(withPosition ? Number(withPosition[2]) / 100 : null);
  }

  return {
    // İki durak zaten yukarıda garanti edildi; demet biçimi ancak iddiayla anlatılabiliyor.
    colors: colors as unknown as GradientProps['colors'],
    locations: fillLocations(positions) as unknown as GradientProps['locations'],
    ...anglePoints(Number(angle)),
  };
};
