import { useEffect, useRef } from 'react';
import { Animated, Easing, type DimensionValue } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/*
  İSKELET — v3'ün `@keyframes skel` deseni: opaklık .45 ⟷ .9 arasında 1,1 sn'lik nabız.
  Katalog ve siparişler ilk açılışta bununla doluyor (Token Kararlari #10).

  Ölçü ÇAĞIRANDAN gelir çünkü iskelet yerini tuttuğu içeriğin ölçüsünü taklit eder — daire mi
  çubuk mu olduğunu ekran bilir, kit bilmez. Yarıçap ise temadan: `full` (çubuk/daire için
  yüksekliğin yarısı) ya da resmî yarıçap setinin bir kademesi.

  a11y'de GÖRÜNMEZ: iskelet içerik değil, yer tutucudur. Ekran okuyucuya "yükleniyor" bilgisini
  veren şey `LoadingState`in `progressbar`ıdır; iskeletin de okunması aynı şeyi iki kez söyler.
*/

interface SkeletonProps {
  width: DimensionValue;
  height: number;
  /**
   * Yarıçap: `full` yüksekliğin yarısı (çubuk/daire), `none` köşesiz — kenardan kenara uzanan
   * blokların (vitrinin günün fırsatı bandı, koleksiyon bantları) sayfadaki karşılığı da
   * köşesizdir ve yuvarlatmak onları "kart" gibi gösterirdi. Ötekiler resmî yarıçap seti.
   */
  radius?: 'full' | 'none' | 'badge' | 'control' | 'card';
  /**
   * Ton: varsayılan gri, ya da bir tık KOYU (`deep`). Koyu ton yalnız bir blok başka bir bloğun
   * ÜSTÜNE biniyorsa gerekir — vitrinin koleksiyon daireleri bantların üstünde çiziliyor ve tek
   * tonda ikisi tek bir gri lekeye dönüşürdü (sayfada da daire bandın kendi renginin koyusudur).
   */
  tone?: 'default' | 'deep';
  testID?: string;
}

export function Skeleton({ width, height, radius = 'full', tone = 'default', testID }: SkeletonProps) {
  const { theme } = useUnistyles();
  const pulse = useRef(new Animated.Value(theme.skeleton.minOpacity)).current;

  useEffect(() => {
    const half = theme.skeleton.durationMs / 2;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: theme.skeleton.maxOpacity,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: theme.skeleton.minOpacity,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, theme.skeleton.durationMs, theme.skeleton.maxOpacity, theme.skeleton.minOpacity]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        tone === 'deep' ? styles.deep : null,
        {
          width,
          height,
          borderRadius: radius === 'full' ? height / 2 : radius === 'none' ? 0 : theme.radius[radius],
          opacity: pulse,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    backgroundColor: theme.colors['sand-300'],
  },
  deep: {
    backgroundColor: theme.colors['sand-400'],
  },
}));
