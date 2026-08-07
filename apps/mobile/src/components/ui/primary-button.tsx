import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  BİRİNCİL DÜĞME — v3'te ~22 kullanım. İki biçim:
  · `block`  — tam genişlik, 52 dp, kontrol yarıçapı, SERT gölge; basılıda `translate(2,2)`
  · `pill`   — içerik genişliği, hap yarıçapı, gölgesiz; basılıda `scale(.97)`
  Ayrım Token Kararlari #8'in kendisidir: gölgeli yüzey kayar, gölgesiz yüzey küçülür.

  ENGELLİ durum tasarımın kendi çözümü: dolgu `disabled-fill`, metin `disabled-text`, gölge YOK
  — gölgesiz bir yüzey "basılabilir" görünmez, engelliliğin görsel karşılığı da budur.
*/

interface PrimaryButtonProps {
  /** Düğme etiketi — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  shape?: 'block' | 'pill';
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  shape = 'block',
  disabled = false,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const isBlock = shape === 'block';

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback={isBlock && !disabled ? 'shadow' : 'scale'}
      compact={!isBlock}
      style={[
        styles.base,
        isBlock ? styles.block : styles.pill,
        disabled ? styles.disabled : styles.enabled,
        isBlock && !disabled ? styles.shadow : undefined,
      ]}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <Text style={[styles.label, disabled ? styles.disabledLabel : styles.enabledLabel]}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  block: {
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
  },
  pill: {
    alignSelf: 'flex-start',
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['6xl'],
    borderRadius: theme.radius.pill,
  },
  shadow: {
    boxShadow: theme.shadow.hard,
  },
  enabled: {
    backgroundColor: theme.colors.olive,
  },
  disabled: {
    backgroundColor: theme.colors['disabled-fill'],
  },
  label: {
    fontFamily: theme.font.body,
    fontSize: theme.text.button,
    fontWeight: theme.text['button--font-weight'],
  },
  // Zeytin dolgunun üstündeki metin paletin saf beyazıdır; ayrı bir "zeytin-üstü" token'ı yok
  // (envantere önerildi — bugün `card` ile aynı değer).
  enabledLabel: { color: theme.colors.card },
  disabledLabel: { color: theme.colors['disabled-text'] },
}));
