import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  GERİ DÜĞMESİ — MÜŞTERİ yüzeyinin geri düğmesi. İki yerleşim:
  · `bar`   — zeminsiz 40 dp yuvarlak; basılıda zemin `sand-200`'e döner (tasarımın kendi
              çözümü: çubuktaki hizanın kayması istenmiyor)
  · `photo` — 42 dp, krem zeminli (fotoğraf üstünde okunabilirlik); basılıda küçülür

  ── ÜÇÜNCÜ VARYANT (`operations`) SÖKÜLDÜ (30.08) ──────────────────────────
  Operasyonun geri düğmesi `neutral-bg` dolgulu bir KUM KUTUCUĞUDUR ve o kutu v3'te 26 yığın
  başlığının hepsinde geçiyor — yani bir varyant değil, kendi başına bir kontrol. Kite
  `OperationsIconButton` olarak çıkarıldı ve buradaki ikizi kaldırıldı; aynı kutunun iki tarifi,
  bir gün ikiye ayrılacak demektir (CLAUDE §1).

  Yan kazanç ölçülebilir: bu dosya artık `operationsTheme`i OKUMUYOR. Paylaşılan kitin operasyon
  temasına uzanması bir dikiş kaçağıydı — `neutral-bg` yalnız o temada var ve müşteri yüzeyinin
  komponenti onu tanımak zorunda değil.

  İşaret metin değil İKONdur (‹) — bu yüzden `label` prop'u yok; ekran okuyucuya giden ad
  `accessibilityLabel` ile gelir ve i18n'den beslenir (komponent metin gömmez).
*/

/** Düğmenin durduğu yüzey — ölçü, dolgu ve basılı geri bildirim bundan türer. */
type BackButtonVariant = 'bar' | 'photo';

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
  glyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.icon,
    color: theme.colors.ink,
    // Tek karakterlik chevron optik olarak yukarıda durur; satır yüksekliği hizayı düzeltir.
    lineHeight: theme.text.icon,
  },
}));
