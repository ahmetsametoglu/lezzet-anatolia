import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from './pressable-surface';

/*
  İKİNCİL DÜĞME — çerçeveli, dolgusuz. İki ton (tasarımın ikisini de kullandığı ayrım):
  · `sand`  — nötr ikinci yol ("Alışverişe dön"): kum çerçeve, mürekkep metin
  · `olive` — olumlu ama ikincil ("Stok haberi ver"): zeytin çerçeve, koyu zeytin metin

  Biçim ve basılı davranış birincil düğmeyle AYNI kuraldan (Token Kararlari #8): blok sert
  gölge + `translate(2,2)`, hap gölgesiz + `scale(.97)`.
*/

interface SecondaryButtonProps {
  /** Düğme etiketi — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  tone?: 'sand' | 'olive';
  shape?: 'block' | 'pill';
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function SecondaryButton({
  label,
  onPress,
  tone = 'sand',
  shape = 'block',
  disabled = false,
  accessibilityHint,
  testID,
}: SecondaryButtonProps) {
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
        disabled ? styles.disabled : styles[tone],
        isBlock && !disabled ? styles.shadow : undefined,
      ]}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      <Text style={[styles.label, disabled ? styles.disabledLabel : styles[`${tone}Label`]]}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.border.base,
  },
  block: {
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
  },
  pill: {
    alignSelf: 'flex-start',
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['5xl'],
    borderRadius: theme.radius.pill,
  },
  shadow: {
    boxShadow: theme.shadow.hard,
  },
  sand: { borderColor: theme.colors['sand-400'] },
  sandLabel: { color: theme.colors.ink },
  olive: { borderColor: theme.colors['olive-line'] },
  oliveLabel: { color: theme.colors['olive-dark'] },
  disabled: { borderColor: theme.colors['disabled-line'] },
  disabledLabel: { color: theme.colors['disabled-text'] },
  label: {
    fontFamily: theme.font.body,
    fontSize: theme.text.button,
    fontWeight: theme.text['button--font-weight'],
  },
}));
