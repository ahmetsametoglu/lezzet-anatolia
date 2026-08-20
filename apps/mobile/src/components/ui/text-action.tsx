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
  /**
   * Metnin kendi içindeki hizası — varsayılan sola yaslı (v3'ün her kullanımı böyle).
   * `center` SÜTUNA yerleşen bağlantılar içindir: iki eşit sütuna konan iki bağlantıda etiket
   * iki satıra sarabiliyor ve sola yaslı sarma, ortalanmış sütunun hizasını bozuyordu (bilgi
   * bandı, 10.08). Genişliği yine çağıran verir; burada sadece satırların hizası kararlaşır.
   */
  align?: 'start' | 'center';
  disabled?: boolean;
  accessibilityHint?: string;
  /** Dikey komşusu olan kullanımlarda payın yönü — künyesi `PressableSurface.compactEdges`. */
  compactEdges?: 'all' | 'up' | 'down';
  testID?: string;
}

export function TextAction({
  label,
  onPress,
  tone = 'olive',
  align = 'start',
  disabled = false,
  accessibilityHint,
  compactEdges,
  testID,
}: TextActionProps) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback="opacity"
      compact
      compactEdges={compactEdges}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <Text style={[styles.label, styles[align], disabled ? styles.disabled : styles[tone]]}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    // Kontrol kademesi (13,5/700) — tasarım bu rolde 12,5 ve 13,5'i birlikte kullanıyor;
    // yuvarlama YOK kuralı gereği token'da var olan durak seçildi (12,5'lik ikizi raporlandı).
    fontSize: theme.text.control,
  },
  start: { textAlign: 'left' },
  center: { textAlign: 'center' },
  olive: { color: theme.colors.olive },
  terracotta: { color: theme.colors.terracotta },
  disabled: { color: theme.colors['disabled-text'] },
}));
