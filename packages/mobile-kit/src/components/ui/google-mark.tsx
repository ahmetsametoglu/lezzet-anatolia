import { GOOGLE_MARK } from '@lezzet/design-tokens/icons';
import Svg, { Path } from 'react-native-svg';

/** Google düğmesinin işareti; boyu Google'ın kuralındaki 18 ve değişmez, geometri ile renkler web'le ortak kaynaktan. */
export function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {GOOGLE_MARK.map((part) => (
        <Path key={part.fill} d={part.d} fill={part.fill} />
      ))}
    </Svg>
  );
}
