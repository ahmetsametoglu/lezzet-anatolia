import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/* Tek seçimli satırın dairesi (ödeme yöntemi, teslim adresi); seçili hâlde kalın zeytin çerçeve olur, boyu değişmez. */

interface RadioDotProps {
  on: boolean;
}

export function RadioDot({ on }: RadioDotProps) {
  return <View style={[styles.radio, on ? styles.on : null]} />;
}

const styles = StyleSheet.create({
  radio: {
    width: operationsTheme.space['5xl'],
    height: operationsTheme.space['5xl'],
    borderRadius: operationsTheme.radius.pill,
    borderWidth: operationsTheme.border.ring,
    borderColor: operationsTheme.colors['sand-500'],
  },
  on: { borderWidth: operationsTheme.space.sm, borderColor: operationsTheme.colors.olive },
});
