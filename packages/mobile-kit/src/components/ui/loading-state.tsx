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

/** Halkanın üç boyu — stil de bunu parametre olarak alıyor (`ring` künyesi). */
type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingStateProps {
  /** Ekran okuyucu adı ("Yükleniyor") — ZORUNLU. */
  accessibilityLabel: string;
  size?: SpinnerSize;
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
      {/* Boyut AYRI BİR STİL DEĞİL, aynı stilin parametresi (27.08 · 21.121) — gerekçe aşağıda,
          `ring` künyesinde: `Animated.View` diziyi düzleştiriyor ve iki unistyles stili tek objede
          buluşunca kütüphane "no updates" uyarısı veriyor. */}
      <Animated.View style={[styles.ring(size), { transform: [{ rotate }] }]} />
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
  /**
   * HALKA — boyut bir PARAMETRE, ayrı bir stil değil (27.08 · 21.121).
   *
   * Önce `ring` + `sm|md|lg` diye İKİ stil vardı ve ikisi `Animated.View`a dizi olarak
   * geçiyordu (`[styles.ring, styles[size], …]`). Dizi sözdizimi doğruydu ama `Animated.View`
   * style'ı DÜZLEŞTİRİYOR: unistyles iki stilini tek objede görüp uyarıyordu —
   * *"we detected style object with 2 unistyles styles… might cause no updates"*. Uyarı boş
   * değil: birleşen stiller tema değişimini alamayabilir, yani karanlık moda geçiş bu halkaya
   * işlemeyebilirdi.
   *
   * **Bu KİTAPLIK DÜZLEŞTİRMESİYDİ, bizim obje yaymamız değil** — statik arama iki turdur bu
   * yüzden temiz çıkıyordu (21.52'nin tahmini doğruymuş). Cihazda `logcat` iziyle bulundu:
   * uyarı hub'ın yükleme anında, tam bu bileşen mount olurken düşüyordu.
   *
   * Dinamik stil TEK unistyles nesnesi döndürür; yanındaki `transform` düz bir objedir ve
   * sayılmaz. Aynı desen `discover-screen`in beş yerinde daha var (künyesi orada).
   */
  ring: (size: SpinnerSize) => {
    const dim = size === 'sm' ? theme.size.spinnerSm : size === 'lg' ? theme.size.spinnerLg : theme.size.spinnerMd;
    return {
      borderColor: theme.colors['sand-300'],
      borderTopColor: theme.colors.olive,
      width: dim,
      height: dim,
      borderRadius: dim / 2,
      // Küçük halkanın çizgisi de ince: aynı kalınlık 16 dp'lik halkada kalın bir yüzük gibi durur.
      borderWidth: size === 'sm' ? theme.border.spinnerSm : theme.border.spinner,
    };
  },
  label: {
    fontFamily: theme.font.body[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
