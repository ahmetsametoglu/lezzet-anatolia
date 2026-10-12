import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { money } from '@/lib/operations/money';
import { dateLabelOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { useStaffOrderContext } from './staff-order-context';
import { dayChipLabelOf } from './staff-order-format';

/* Açılan siparişin özeti: numara, kesin toplam, gün ve depo. Geri dönüş girişin geldiği yere (merkez ya da durak) gider. */

const d = t.done;

export function StaffOrderDoneScreen() {
  const router = useRouter();
  const order = useStaffOrderContext();
  const placed = order.placed;
  const fromStop = order.entry.stopNo !== null;

  if (placed === null) {
    return (
      <View style={styles.screen} testID="staff-order-done">
        <OperationsStackHeader title={d.title} onBack={() => router.back()} backLabel={t.back} testID="staff-order-done-header" />
        <View style={styles.body}>
          <OperationsNoticeBlock variant="empty" title={d.emptyTitle} description={d.emptyBody} testID="staff-order-done-empty" />
        </View>
      </View>
    );
  }

  const method = t.page.methodShort[placed.payment];
  const route = placed.deliveryType === 'route' && placed.deliveryDate !== null;
  const when = route
    ? fillCopy(d.when, { day: dayChipLabelOf(placed.deliveryDate ?? ''), warehouse: placed.warehouseName ?? '', method })
    : fillCopy(d.whenShipping, { warehouse: placed.warehouseName ?? '', method });
  const note = route ? fillCopy(d.note, { day: dateLabelOf(placed.deliveryDate ?? '') ?? '' }) : d.noteShipping;

  return (
    <View style={styles.screen} testID="staff-order-done">
      <OperationsStackHeader title={d.title} onBack={() => router.back()} backLabel={t.back} testID="staff-order-done-header" />
      <View style={styles.body}>
        <View style={styles.card}>
          <View style={styles.ok}>
            <Text style={styles.okMark}>✓</Text>
          </View>
          <Text style={styles.ref} testID="staff-order-done-ref">
            {placed.referenceNo ?? ''}
          </Text>
          <Text style={styles.line}>{fillCopy(d.summary, { customer: placed.customerName, total: money(placed.totalCents) })}</Text>
          <Text style={styles.line}>{when}</Text>
          <View style={styles.rule} />
          <Text style={[styles.line, styles.note]}>{note}</Text>
        </View>
      </View>
      <OperationsStickyBar testID="staff-order-done-footer">
        <PrimaryButton
          label={d.again}
          onPress={() => {
            order.reset();
            router.replace('/order');
          }}
          testID="staff-order-done-again"
        />
        <SecondaryButton
          label={fromStop ? d.toStop : d.home}
          elevation="flat"
          onPress={() => router.back()}
          testID="staff-order-done-back"
        />
      </OperationsStickyBar>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  body: { paddingHorizontal: operationsTheme.space['5xl'], paddingTop: operationsTheme.space.xl },
  card: {
    alignItems: 'center',
    gap: operationsTheme.space.xs,
    padding: operationsTheme.space['6xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.card,
  },
  ok: {
    width: operationsTheme.size.controlSm,
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  okMark: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.icon,
    color: operationsTheme.colors['olive-dark'],
  },
  ref: {
    marginTop: operationsTheme.space.sm,
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  line: {
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  rule: {
    alignSelf: 'stretch',
    marginVertical: operationsTheme.space['2xl'],
    height: operationsTheme.border.base,
    backgroundColor: operationsTheme.colors['sand-300'],
  },
  note: { lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'] },
});
