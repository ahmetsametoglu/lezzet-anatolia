import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/* Formun alt çubuğu: düğmenin üstünde ilk eksiği söyleyen tek satır. Satırın yeri boşken de ayrılmıştır, düğme yerinden oynamaz. */

interface SubmitBarProps {
  why: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}

export function SubmitBar({ why, label, disabled, onPress, testID }: SubmitBarProps) {
  return (
    <OperationsStickyBar testID={testID}>
      <Text style={styles.why} numberOfLines={1} testID={`${testID}-why`}>
        {why}
      </Text>
      <PrimaryButton label={label} disabled={disabled} onPress={onPress} singleLine testID={`${testID}-submit`} />
    </OperationsStickyBar>
  );
}

const styles = StyleSheet.create({
  why: {
    height: operationsTheme.space['3xl'],
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
});
