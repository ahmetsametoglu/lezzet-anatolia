import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { formatSiret } from '@lezzet/domain-core';
import type { StaffCustomerOption } from '@lezzet/types';

import { OperationsStatusBadge } from '@/components/operations/status-badge';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from '../copy';
import { customerBadgeOf, customerCreditLineOf } from '../staff-order-format';

/* Seçicinin müşteri satırı: ad ve rozet, telefon ve SIRET, vade satırı. Boyu sabittir; liste bu boyla ölçülür. */

export const CUSTOMER_ROW_HEIGHT = operationsTheme.size.controlStack + operationsTheme.space.xs;

const BADGE_TONE = { ok: 'active', warn: 'warn', mute: 'idle' } as const;

interface CustomerRowProps {
  customer: StaffCustomerOption;
  onPress: () => void;
}

export function CustomerRow({ customer, onPress }: CustomerRowProps) {
  const badge = customerBadgeOf(customer);
  const credit = customerCreditLineOf(customer, 'picker');
  const contact = [customer.phone, customer.siret === null ? null : fillCopy(t.customer.siret, { siret: formatSiret(customer.siret) })]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      style={styles.row}
      accessibilityLabel={customer.name}
      testID={`staff-order-customer-${customer.id}`}
    >
      <View style={styles.titleLine}>
        <Text style={styles.name} numberOfLines={1}>
          {customer.name}
        </Text>
        <OperationsStatusBadge label={badge.label} tone={BADGE_TONE[badge.tone]} />
      </View>
      <Text style={styles.contact} numberOfLines={1}>
        {contact}
      </Text>
      <Text style={[styles.creditLine, styles[credit.tone]]} numberOfLines={1}>
        {credit.text}
      </Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  row: {
    height: CUSTOMER_ROW_HEIGHT,
    justifyContent: 'center',
    gap: operationsTheme.space['2xs'],
    borderBottomWidth: operationsTheme.border.base,
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  name: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  contact: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  creditLine: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta },
  muted: { color: operationsTheme.colors.muted },
  credit: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors['olive-dark'],
  },
  warn: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
  },
});
