import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  ÇİP — kategori rayı, çeşit seçimi, teslimat günü, dil, adet kısayolu (6 ekran). Seçim çifti
  tasarımda SABİTTİR: seçili = zeytin dolgu + beyaz metin + zeytin çerçeve; seçilmemiş = dolgusuz
  + mürekkep metin + mürekkep çerçeve. İki yarıçap kademesi var (kontrol 16 ⟷ yumuşak 14).

  SEÇİLİLİK a11y'ye de gider (`accessibilityState.selected`): renk farkı ekran okuyucuya
  ulaşmaz, seçili çipin seçili olduğunu söyleyen tek şey bu bayraktır.
*/

interface ChipProps {
  /** Çip metni — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  selected?: boolean;
  /** Köşe kademesi: kontrol (16) varsayılan, yumuşak (14) dar raylarda. */
  shape?: 'control' | 'soft';
  disabled?: boolean;
  testID?: string;
}

export function Chip({ label, onPress, selected = false, shape = 'control', disabled = false, testID }: ChipProps) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      selected={selected}
      feedback="scale-small"
      compact
      style={[
        styles.base,
        styles[shape],
        disabled ? styles.disabled : selected ? styles.selected : styles.idle,
      ]}
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.label, disabled ? styles.disabledLabel : selected ? styles.selectedLabel : styles.idleLabel]}>
        {label}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  base: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['3xl'],
    borderWidth: theme.border.hairline,
  },
  control: { borderRadius: theme.radius.control },
  soft: { borderRadius: theme.radius.soft },
  selected: {
    backgroundColor: theme.colors.olive,
    borderColor: theme.colors.olive,
  },
  selectedLabel: { color: theme.colors.card },
  idle: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.ink,
  },
  idleLabel: { color: theme.colors.ink },
  disabled: {
    backgroundColor: 'transparent',
    borderColor: theme.colors['disabled-line'],
  },
  disabledLabel: { color: theme.colors['disabled-text'] },
  label: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    // Tasarım çipi 12,5 çiziyor; kontrol kademelerinde yuvarlama YOK kuralı gereği token'ın
    // kendi durağı kullanıldı (`control` 13,5/700). 12,5'lik durak raporlandı.
    fontSize: theme.text.control,
  },
}));
