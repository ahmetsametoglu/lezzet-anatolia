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
   * Ton — üç kademe: `soft` · `default` · `deep`. Varsayılanın dışına yalnız bloklar BİRBİRİNE
   * DEĞİYORSA çıkılır; ayrı duran bloklar arasında ton farkı bir şey söylemez, gürültü olur.
   *
   * İki gerçek ihtiyaç (vitrin, kullanıcı bulgusu 10.08): (1) koleksiyon bantları BİTİŞİK ve tek
   * tonda altısı tek bir gri lekeye dönüşüyor — sayfada da bantlar üç renk arasında dönüyor;
   * (2) daireler bantların ÜSTÜNE biniyor ve zeminlerinden ayrışmaları gerekiyor.
   */
  tone?: 'soft' | 'default' | 'deep';
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
        /* TEK unistyles stili — iki tane OLAMAZ (ölçüldü 15.08, MB-30). Burada dizi sözdizimi
           doğru kullanılıyordu ama `Animated.View` diziyi İÇERİDE tek nesneye düzleştiriyor;
           düzleşen nesnede iki unistyles anahtarı yan yana gelince kitaplık "no updates or
           unpredictable behavior" uyarısını basıyordu — yani tema değişiminin (karanlık mod)
           iskelete işlemeyeceği gerçek bir risk. Çözüm zemini ton başına TAM stile taşımak:
           `block` + üstüne binen `soft`/`deep` yerine üç bağımsız ton. */
        styles[tone],
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

/* Adlar TONLA eşleşiyor (`styles[tone]`) — üçü de TAM stil, biri ötekinin üstüne binmiyor.
   `default` ton adının kendisidir; `block` adı kalksın diye değil, üç tonun eşit hâle gelmesi
   için gitti (üstteki künye). */
const styles = StyleSheet.create((theme) => ({
  soft: {
    backgroundColor: theme.colors['sand-250'],
  },
  default: {
    backgroundColor: theme.colors['sand-300'],
  },
  deep: {
    backgroundColor: theme.colors['sand-400'],
  },
}));
