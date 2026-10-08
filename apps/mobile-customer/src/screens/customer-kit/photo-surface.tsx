import type { CatalogImage } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';

/*
  Dikdörtgen fotoğraf yüzeyi `CirclePhoto`nun ikizidir: "fotoğraf varsa fotoğraf, yoksa baş harf" davranışı tek yerde kalsın diye ayrı durur.
  Ölçü ve köşe çağırandan gelir, yüzey yalnız kırpar; skrim yalnız üstünde yazı olan fotoğrafa çizilir, çünkü gereksiz karartma fotoğrafı kirletir.
*/

interface PhotoSurfaceProps {
  /**
   * Katalog görseli (21.303). Yüzey kendi boyunu bilmez (künye) — `FrameImage` kutuyu ölçer ve oranına
   * en yakın CDN çerçevesini, boyuna yeten basamaktan ister: 168'lik tarif kartı geniş, 280'lik raf
   * kartı dikey türevi alır, ikisi de aynı yüzeyden.
   */
  image: CatalogImage;
  /** Fotoğraf yokken çizilen baş harf. */
  initial: string;
  /** Alt kenarı karartan geçiş — üstünde yazı duracaksa. */
  scrim?: boolean;
  /** Yalnız fotoğraf solar; skrim ve üstündeki yazı solmaz, yoksa yazı okunmaz olurdu. */
  faded?: boolean;
  /** Ölçü + köşe yarıçapı çağırandan gelir. */
  style?: StyleProp<ViewStyle>;
  /** Fotoğrafın ÜSTÜNDEKİ katman: rozet, altyazı. */
  children?: ReactNode;
  testID?: string;
}

export function PhotoSurface({ image, initial, scrim = false, faded = false, style, children, testID }: PhotoSurfaceProps) {
  const { theme } = useUnistyles();

  return (
    <View style={[styles.surface, style]} testID={testID}>
      {image.url === null ? (
        <View style={[styles.placeholder, faded ? styles.faded : undefined]}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      ) : (
        <FrameImage image={image} style={[styles.image, faded ? styles.faded : undefined]} />
      )}
      {scrim ? <LinearGradient {...theme.gradient.photoBottom} style={styles.scrim} pointerEvents="none" /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  surface: {
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
  faded: { opacity: theme.soldOutOpacity },
}));
