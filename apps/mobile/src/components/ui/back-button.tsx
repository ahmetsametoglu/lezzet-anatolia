import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  GERİ DÜĞMESİ — 11 başlık çubuğunda + fotoğraf kahramanının üstünde + sepette. İki yerleşim:
  · çubukta  — zeminsiz 40 dp yuvarlak; basılıda zemin `sand-200`'e döner (tasarımın kendi
               çözümü: çubuktaki hizanın kayması istenmiyor)
  · fotoğrafta — 42 dp, krem zeminli (fotoğraf üstünde okunabilirlik); basılıda küçülür

  İşaret metin değil İKONdur (‹) — bu yüzden `label` prop'u yok; ekran okuyucuya giden ad
  `accessibilityLabel` ile gelir ve i18n'den beslenir (komponent metin gömmez).
*/

interface BackButtonProps {
  onPress: () => void;
  /** Ekran okuyucu adı ("Geri") — i18n üstte çözülür, ZORUNLU. */
  accessibilityLabel: string;
  /** Fotoğraf kahramanının üstünde mi duruyor? */
  onPhoto?: boolean;
  testID?: string;
}

export function BackButton({ onPress, accessibilityLabel, onPhoto = false, testID }: BackButtonProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback={onPhoto ? 'scale-small' : 'tint'}
      compact
      style={[styles.base, onPhoto ? styles.onPhoto : styles.inBar]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Text style={styles.glyph}>‹</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inBar: {
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
  },
  onPhoto: {
    width: theme.size.iconButtonOnPhoto,
    height: theme.size.iconButtonOnPhoto,
    borderRadius: theme.size.iconButtonOnPhoto / 2,
    // Tasarım burada yarı saydam krem kullanıyor (`rgba(243,239,226,.9)`); alfalı katmanın
    // token'ı YOK, o yüzden opak kum kademesi kullanıldı (rapor edildi).
    backgroundColor: theme.colors['sand-50'],
  },
  glyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.icon,
    color: theme.colors.ink,
    // Tek karakterlik chevron optik olarak yukarıda durur; satır yüksekliği hizayı düzeltir.
    lineHeight: theme.text.icon,
  },
}));
