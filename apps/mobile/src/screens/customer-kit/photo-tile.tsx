import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { type DimensionValue, Image, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';

/*
  FOTOĞRAF KARTI — "büyük görsel + altında koyulaşan skrim + üstünde yazı" kalıbı. v3'te üç yerde
  aynı kurgu: tarif kartı (v3:136), hazır paket kartı (v3:150) ve paket detayının kahramanı.

  KİTTEKİ `ProductPhotoCard`IN İKİZİ DEĞİL: o KARE bir ÜRÜN kartıdır (fiyat çipi zorunlu, tükendi
  ve indirim rozetleri, ad iki satıra kırpılı) — yani ürün sözleşmesine bağlı. Bu ise boş bir
  YÜZEY: altına ne yazılacağını çağıran söyler. İkisini birleştirmek, ürün kartına "ama bazen
  fiyat yok, bazen ad yok" diye üç bayrak eklemek olurdu.

  FOTOĞRAF YOKKEN baş harf çizilir (şablonun `noPh` varyantı) — `CirclePhoto`nun DAİRE karşılığı
  burada dikdörtgendir, o yüzden o komponent kullanılamadı.

  SKRİM token'dan (`gradient.photoBottom`): fotoğrafın alt kenarını karartıp üstündeki yazıyı
  okunur kılan geçiş. Dokunuşu geçirir (`pointerEvents="none"`), yoksa kartın kendisi basılmazdı.
*/

interface PhotoTileProps {
  height: number;
  /** Sabit genişlik (yatay ray); verilmezse kart bulunduğu sütunu doldurur. */
  width?: DimensionValue;
  photoUri: string | null;
  /** Fotoğraf yokken çizilen baş harf. */
  initial: string;
  /** Sol üst köşedeki rozet yuvası (tarif kartının süresi). */
  topBadge?: ReactNode;
  /** Alt kenardaki içerik — skrimin üstünde durur. */
  children: ReactNode;
  onPress: () => void;
  /** Ekran okuyucu adı — ZORUNLU: kartın içindeki metin görsel katmandadır. */
  accessibilityLabel: string;
  testID?: string;
}

export function PhotoTile({
  height,
  width,
  photoUri,
  initial,
  topBadge,
  children,
  onPress,
  accessibilityLabel,
  testID,
}: PhotoTileProps) {
  const { theme } = useUnistyles();

  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={[styles.tile, { height }, width === undefined ? undefined : { width }]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {photoUri === null ? (
        <View style={styles.placeholder}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      ) : (
        <Image source={{ uri: photoUri }} style={styles.image} accessibilityIgnoresInvertColors />
      )}
      <LinearGradient {...theme.gradient.photoBottom} style={styles.scrim} pointerEvents="none" />
      {topBadge === undefined ? null : <View style={styles.topBadge}>{topBadge}</View>}
      <View style={styles.caption}>{children}</View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  tile: {
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors['sand-300'],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  initial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors.terracotta,
  },
  scrim: {
    position: 'absolute',
    inset: 0,
  },
  topBadge: {
    position: 'absolute',
    top: theme.space.lg,
    left: theme.space.lg,
  },
  caption: {
    position: 'absolute',
    left: theme.space['2xl'],
    right: theme.space['2xl'],
    bottom: theme.space.xl,
  },
}));
