import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffAddressOption } from '@lezzet/types';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from '../copy';
import { RadioDot } from './radio-dot';

/* Adres seçicinin satırı: sokak, şehir ve alıcı, fatura adresi işareti. İşaretin satırı boşken de yer tutar, satırların boyu eşittir. */

export const ADDRESS_ROW_HEIGHT = operationsTheme.size.controlAmount + operationsTheme.space.lg;

interface AddressRowProps {
  address: StaffAddressOption;
  selected: boolean;
  onPress: () => void;
}

export function AddressRow({ address, selected, onPress }: AddressRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      selected={selected}
      feedback="scale"
      style={styles.row}
      accessibilityLabel={address.label}
      testID={`staff-order-address-${address.id}`}
    >
      <RadioDot on={selected} />
      <View style={styles.texts}>
        <Text style={styles.line1} numberOfLines={1}>
          {address.line1}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {`${address.cityLine} · ${fillCopy(t.addressPicker.recipient, { name: address.recipient })}`}
        </Text>
        <Text style={styles.tag} numberOfLines={1}>
          {address.isBilling ? t.addressPicker.billing : ' '}
        </Text>
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ADDRESS_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    borderBottomWidth: operationsTheme.border.base,
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  texts: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  line1: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  sub: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  tag: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta, color: operationsTheme.colors['tab-inactive'] },
});
