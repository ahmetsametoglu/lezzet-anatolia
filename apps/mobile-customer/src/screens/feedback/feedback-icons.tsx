import { THUMB_PATH } from '@lezzet/design-tokens/icons';
import Svg, { Path } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

/*
  Geri bildirim ekranının iki ikonu, şablondan birebir. Kitin `Icon`una girmezler: başparmağın "beğenmedim" hâli aynı yolun 180°
  dönmüşüdür ve `Icon` döndürme bilmez, kalp ise çizgi değil dolgu çizilir.
*/

/** Kalp — dolu ikon; şablon burada çizgi değil dolgu kullanıyor. */
const HEART_PATH =
  'M12 20.5C6 15.5 3 12.3 3 8.8 3 6.2 5 4.5 7.3 4.5c1.8 0 3.4 1 4.7 2.7 1.3-1.7 2.9-2.7 4.7-2.7C19 4.5 21 6.2 21 8.8c0 3.5-3 6.7-9 11.7z';

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
