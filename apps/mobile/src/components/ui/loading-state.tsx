import { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/*
  YÜKLENİYOR HALKASI — tasarımda üç boyut: satır içi 18 (liste sonu), 40 (giriş), 44 (ödeme).
  Görünüm kum izli halka + zeytin üst yay; RN'in `ActivityIndicator`ı tek renk aldığı için
  halka elle çiziliyor (iz rengi + üst kenar rengi ayrı token).

  Dönüş `Animated` ile ve NATIVE sürücüde: `transform` native tarafta çalışabilen bir özellik,
  JS iş parçacığı meşgulken bile dönmeye devam etmesi gerekir — yüklenme göstergesinin donması
  "uygulama kilitlendi" diye okunur.

  a11y: `progressbar` rolü + `busy` durumu; etiket PROP'la gelir (i18n üstte).
*/

interface LoadingStateProps {
  /** Ekran okuyucu adı ("Yükleniyor") — ZORUNLU. */
  accessibilityLabel: string;
  size?: 'sm' | 'md' | 'lg';
  /** Halkanın yanında görünen metin (isteğe bağlı). */
  label?: string;
  testID?: string;
}

export function LoadingState({ accessibilityLabel, size = 'md', label, testID }: LoadingStateProps) {
  const { theme } = useUnistyles();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: theme.spinDurationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress, theme.spinDurationMs]);

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View
      style={styles.row}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
    >
      <Animated.View style={[styles.ring, styles[size], { transform: [{ rotate }] }]} />
      {label === undefined ? null : <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.md,
  },
  ring: {
    borderColor: theme.colors['sand-300'],
    borderTopColor: theme.colors.olive,
  },
  sm: {
    width: theme.size.spinnerSm,
    height: theme.size.spinnerSm,
    borderRadius: theme.size.spinnerSm / 2,
    borderWidth: theme.border.spinnerSm,
  },
  md: {
    width: theme.size.spinnerMd,
    height: theme.size.spinnerMd,
    borderRadius: theme.size.spinnerMd / 2,
    borderWidth: theme.border.spinner,
  },
  lg: {
    width: theme.size.spinnerLg,
    height: theme.size.spinnerLg,
    borderRadius: theme.size.spinnerLg / 2,
    borderWidth: theme.border.spinner,
  },
  label: {
    fontFamily: theme.font.body[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text.helper,
    fontWeight: theme.text['card-title-sm--font-weight'],
    color: theme.colors.muted,
  },
}));
