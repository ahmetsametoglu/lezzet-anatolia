import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';
import { PressableSurface } from './pressable-surface';

/*
  GERİ DÜĞMESİ — 11 başlık çubuğunda + fotoğraf kahramanının üstünde + sepette. Üç yerleşim:
  · `bar`        — zeminsiz 40 dp yuvarlak; basılıda zemin `sand-200`'e döner (tasarımın kendi
                   çözümü: çubuktaki hizanın kayması istenmiyor)
  · `photo`      — 42 dp, krem zeminli (fotoğraf üstünde okunabilirlik); basılıda küçülür
  · `operations` — 40 dp, `neutral-bg` dolgulu (Operasyon Mobil v2:785); basılıda küçülür.
                   Operasyon ekranlarında fotoğraf yok, ama düğmenin ZEMİNİ var: v2 onu sayfadan
                   ayrı bir daire olarak çiziyor. `photo` varyantına bağlanMADI — orada zemin
                   fotoğrafa karşı okunurluk içindir, burada yüzey hiyerarşisinin kendisi.

  İşaret metin değil İKONdur (‹) — bu yüzden `label` prop'u yok; ekran okuyucuya giden ad
  `accessibilityLabel` ile gelir ve i18n'den beslenir (komponent metin gömmez).

  Operasyon dolgusu `operationsTheme` sabitinden okunur (`neutral-bg` yalnız o temada var) —
  gerekçe `theme/unistyles.ts` künyesinde.
*/

/** Düğmenin durduğu yüzey — ölçü, dolgu ve basılı geri bildirim bundan türer. */
type BackButtonVariant = 'bar' | 'photo' | 'operations';

interface BackButtonProps {
  onPress: () => void;
  /** Ekran okuyucu adı ("Geri") — i18n üstte çözülür, ZORUNLU. */
  accessibilityLabel: string;
  variant?: BackButtonVariant;
  testID?: string;
}

export function BackButton({ onPress, accessibilityLabel, variant = 'bar', testID }: BackButtonProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback={variant === 'bar' ? 'tint' : 'scale-small'}
      compact
      style={[styles.base, styles[variant]]}
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
  bar: {
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
  },
  photo: {
    width: theme.size.iconButtonOnPhoto,
    height: theme.size.iconButtonOnPhoto,
    borderRadius: theme.size.iconButtonOnPhoto / 2,
    // Tasarım burada yarı saydam krem kullanıyor (`rgba(243,239,226,.9)`); alfalı katmanın
    // token'ı YOK, o yüzden opak kum kademesi kullanıldı (rapor edildi).
    backgroundColor: theme.colors['sand-50'],
  },
  operations: {
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  glyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.icon,
    color: theme.colors.ink,
    // Tek karakterlik chevron optik olarak yukarıda durur; satır yüksekliği hizayı düzeltir.
    lineHeight: theme.text.icon,
  },
}));
