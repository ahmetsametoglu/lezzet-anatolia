import type { CatalogImage } from '@lezzet/types';
import { Image, type StyleProp, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CDN_IMAGE_HEADERS, FrameImage } from './frame-image';

/*
  DAİRE FOTOĞRAF — kitin İÇ ilkeli; dışarıya `AvatarThumb` ve `ProductCircleCard` olarak çıkar.
  Ayrı durmasının sebebi tek: ikisi de "fotoğraf varsa fotoğraf, yoksa baş harf" davranışını
  taşıyor ve bu davranışın iki kopyası bir gün ayrışırdı (CLAUDE §1 — hiçbir türde duplication).
  Prototipin `image-slot` aracının RN'deki karşılığı da budur (envanter §8.10).

  Ölçü ve yazı kademesi ÇAĞIRANDAN gelir: avatar ile ürün dairesinin skalaları farklı, ikisi de
  kendi ölçüsünü temadan okur.
*/

interface CirclePhotoProps {
  size: number;
  /** Fotoğraf yoksa gösterilen baş harf. */
  initial: string;
  initialFontSize: number;
  photoUri?: string | null;
  /**
   * KATALOG görseli (21.303) — verilirse `photoUri`nin yerine geçer. Daire kare bir kutudur ve çapı
   * (`size`) bilindiği için görsel ölçüm beklemeden, bu çapa yeten CDN basamağından istenir
   * (`FrameImage`). `photoUri` hazır adresli görseller içindir: kişi avatarı, operasyonun küçük resmi.
   */
  image?: CatalogImage | null;
  /** Ekran okuyucu adı; verilmezse daire a11y ağacından çıkar (dekoratif). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  initialStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export function CirclePhoto({
  size,
  initial,
  initialFontSize,
  photoUri,
  image,
  accessibilityLabel,
  style,
  initialStyle,
  testID,
}: CirclePhotoProps) {
  const isDecorative = accessibilityLabel === undefined;

  return (
    <View
      testID={testID}
      accessible={!isDecorative}
      accessibilityRole={isDecorative ? undefined : 'image'}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={isDecorative}
      importantForAccessibility={isDecorative ? 'no-hide-descendants' : 'auto'}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      {image != null && image.url !== null ? (
        <FrameImage image={image} box={{ width: size, height: size }} style={styles.image} />
      ) : photoUri === undefined || photoUri === null ? (
        <Text style={[styles.initial, { fontSize: initialFontSize }, initialStyle]}>{initial}</Text>
      ) : (
        <Image source={{ uri: photoUri, headers: CDN_IMAGE_HEADERS }} style={styles.image} accessibilityIgnoresInvertColors />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: theme.colors['sand-300'],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    color: theme.colors.muted,
  },
}));
