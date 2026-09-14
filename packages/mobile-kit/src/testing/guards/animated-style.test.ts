import { describeAnimatedStyleGuard, usesReactNativeAnimated, violationsIn } from './animated-style';
import { KIT_SRC } from './source-files';

/* Kitin kendi kaynağı da aynı kurala tabi (paylaşılan bileşenlerin çoğu burada). */
describeAnimatedStyleGuard(KIT_SRC);

describe('animasyon bekçisinin kendisi', () => {
  /* BEKÇİNİN KENDİSİ ÖLÇÜLÜR — ayracı iki yönde de sınanır, çünkü bir yönde bozulursa yalancı
     kırmızı, öteki yönde bozulursa GÖRMEDEN yeşil kalır ve ikincisi sessizdir. */
  it('RN `Animated` ile Reanimated`ı ayırır', () => {
    expect(usesReactNativeAnimated("import { Animated, Text } from 'react-native';")).toBe(true);
    expect(usesReactNativeAnimated("import Animated from 'react-native-reanimated';")).toBe(false);
    // Tuzak: aynı dosya Reanimated'ı varsayılan alıp RN'den başka şeyler alabilir.
    expect(usesReactNativeAnimated("import { View } from 'react-native';\nimport Animated from 'react-native-reanimated';")).toBe(false);
  });

  it('TEK stil ile İKİ stili ayırır — dinamik stil tek sayılır', () => {
    const tek = "import { Animated } from 'react-native';\n<Animated.View style={[styles.ring(size), { opacity }]} />";
    const iki = "import { Animated } from 'react-native';\n<Animated.View style={[styles.ring, styles.md, { opacity }]} />";
    expect(violationsIn('x.tsx', tek)).toEqual([]);
    expect(violationsIn('x.tsx', iki)).toHaveLength(1);
  });
});
