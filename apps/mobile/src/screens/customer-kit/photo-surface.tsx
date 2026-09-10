import type { CatalogImage } from '@lezzet/types';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { FrameImage } from '@/components/ui/frame-image';

/*
  DİKDÖRTGEN FOTOĞRAF YÜZEYİ — kitin İÇ ilkeli; `CirclePhoto`nun (daire) dikdörtgen ikizi ve
  aynı gerekçeyle ayrı duruyor: "fotoğraf varsa fotoğraf, yoksa baş harf" davranışının iki kopyası
  bir gün ayrışırdı (CLAUDE §1). Prototipin `image-slot shape="rect"` aracının karşılığıdır.

  DIŞARIYA İKİ BİÇİMDE ÇIKAR: `PhotoTile` (basılabilir tam kart) ve paket listesi kartının
  fotoğraf bölgesi (kartın gövdesi fotoğrafın ALTINDA sürüyor, yani tile değil).

  ÖLÇÜ VE KÖŞE ÇAĞIRANDAN: yüzey kendi boyunu bilmez — 168'lik tarif kartı da, 198'lik paket
  fotoğrafı da aynı yüzeydir. Kendi taşıdığı tek görünüm kararı KIRPMADIR (`overflow: hidden`):
  fotoğraf kabın köşelerinin dışına taşamaz.

  SKRİM İSTEĞE BAĞLI (`gradient.photoBottom`): fotoğrafın alt kenarını karartıp üstündeki yazıyı
  okunur kılar. Dokunuşu geçirir (`pointerEvents="none"`), yoksa üstündeki kart basılmazdı.
  Yazısı olmayan bir fotoğrafta çizilmez — gereksiz karartma, fotoğrafı kirletmekten başka bir şey
  yapmaz.
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
  /** Ölçü + köşe yarıçapı çağırandan gelir. */
  style?: StyleProp<ViewStyle>;
  /** Fotoğrafın ÜSTÜNDEKİ katman: rozet, altyazı. */
  children?: ReactNode;
  testID?: string;
}

export function PhotoSurface({ image, initial, scrim = false, style, children, testID }: PhotoSurfaceProps) {
  const { theme } = useUnistyles();

  return (
    <View style={[styles.surface, style]} testID={testID}>
      {image.url === null ? (
        <View style={styles.placeholder}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      ) : (
        <FrameImage image={image} style={styles.image} />
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
}));
