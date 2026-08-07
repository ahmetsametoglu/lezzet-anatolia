import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  METİN EYLEMİ — zemini olmayan bağlantı ("Tüm katalog ›", "Düzenle", "Çıkış yap"); v3'te ~10
  kullanım. İki ton: zeytin (olumlu/nötr) · terracotta (dikkat isteyen: çıkış, adres sil).

  Basılı geri bildirim OPAKLIK (tasarımın kendi çözümü): zemini olmayan bir metnin küçülmesi
  titrek okunur. Görsel yüksekliği ~20 dp olduğu için `compact` payıyla 44 dp'ye tamamlanır.
*/

interface TextActionProps {
  /** Bağlantı metni — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  tone?: 'olive' | 'terracotta';
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function TextAction({
  label,
  onPress,
  tone = 'olive',
  disabled = false,
  accessibilityHint,
  testID,
}: TextActionProps) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback="opacity"
      compact
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <Text style={[styles.label, disabled ? styles.disabled : styles[tone]]}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    fontFamily: theme.font.body,
    // Kontrol kademesi (13,5/700) — tasarım bu rolde 12,5 ve 13,5'i birlikte kullanıyor;
    // yuvarlama YOK kuralı gereği token'da var olan durak seçildi (12,5'lik ikizi raporlandı).
    fontSize: theme.text.control,
    fontWeight: theme.text['control--font-weight'],
  },
  olive: { color: theme.colors.olive },
  terracotta: { color: theme.colors.terracotta },
  disabled: { color: theme.colors['disabled-text'] },
}));
