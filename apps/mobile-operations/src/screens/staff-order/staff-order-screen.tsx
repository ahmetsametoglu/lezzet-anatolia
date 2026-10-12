import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStatusBadge } from '@/components/operations/status-badge';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { money } from '@/lib/operations/money';
import { negotiatesPrice } from '@/lib/operations/sections';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsIdentity, useOperationsWorkplace } from '@/screens/operations/sections-context';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { DayChips } from './components/day-chips';
import { OrderLineAdminRow, OrderLineRow } from './components/order-line-row';
import { OrderSection } from './components/order-section';
import { PayRow } from './components/pay-row';
import { PickRow } from './components/pick-row';
import { SubmitBar } from './components/submit-bar';
import { useStaffOrderContext } from './staff-order-context';
import { activeLines, customerBadgeOf, customerCreditLineOf, lineIssueOf } from './staff-order-format';

/*
  Müşteri adına sipariş tek sayfada dört bölümdür; seçim sayfanın içinde değil tam ekran seçicide yapılır, bölümler kapanıp açılmaz
  ve hiçbir öğe yerinden oynamaz. Alttaki düğme eksik olanı üstünde söyler.
*/

const BADGE_TONE = { ok: 'active', warn: 'warn', mute: 'idle' } as const;

interface StaffOrderScreenProps {
  /** Duraktan açıldıysa durağın siparişi ve sırası; depo merkezinden açılınca ikisi de `null`. */
  fromOrderId: string | null;
  stopNo: string | null;
}

export function StaffOrderScreen({ fromOrderId, stopNo }: StaffOrderScreenProps) {
  const router = useRouter();
  const order = useStaffOrderContext();
  const { openFromStop } = order;

  useEffect(() => {
    if (fromOrderId !== null) openFromStop({ fromOrderId, stopNo });
  }, [fromOrderId, openFromStop, stopNo]);
  const identity = useOperationsIdentity();
  const workplace = useOperationsWorkplace();
  const isAdmin = negotiatesPrice(identity.sections);

  const subtitle = [
    order.entry.stopNo === null ? workplace : fillCopy(t.page.fromStop, { n: order.entry.stopNo }),
    identity.name,
    isAdmin ? t.page.roleAdmin : order.entry.stopNo === null ? null : t.page.roleCourier,
  ]
    .filter(Boolean)
    .join(' · ');

  const customer = order.customer;
  const delivery = order.context?.delivery ?? null;
  const route = delivery?.deliveryType === 'route';
  const warehouseKnown = delivery !== null && delivery.warehouseId !== null && delivery.unresolvedReason === null;
  const hasLines = activeLines(order.lines).length > 0;
  const linesOk = activeLines(order.lines).every((line) => lineIssueOf(line, order.shipping) === null);
  const retailOnly = customer !== null && (customer.b2bPending || (customer.type === 'company' && customer.channel === 'b2c'));

  const addressRow = (() => {
    if (customer === null) {
      return (
        <PickRow
          title={t.page.addressEmpty}
          sub={t.page.addressEmptyHint}
          subTone="faint"
          state="off"
          accessibilityLabel={t.page.addressEmpty}
        />
      );
    }
    if (order.addresses === 'loading' || order.addresses === null) {
      return <PickRow title={t.page.addressLoading} sub="" state="off" accessibilityLabel={t.page.addressLoading} />;
    }
    if (order.addresses === 'error') {
      return (
        <PickRow
          title={t.page.addressError}
          sub={t.page.addressErrorHint}
          subTone="warn"
          state="empty"
          onPress={order.reloadAddresses}
          accessibilityLabel={t.page.addressError}
          testID="staff-order-address-retry"
        />
      );
    }
    const address = order.addresses.find((a) => a.id === order.addressId);
    if (address === undefined) {
      return (
        <PickRow
          title={t.page.addressNone}
          sub={t.page.addressNoneHint}
          subTone="faint"
          state="empty"
          action={t.page.search}
          onPress={() => router.push('/order/address')}
          accessibilityLabel={t.page.addressNone}
          testID="staff-order-address"
        />
      );
    }
    const where =
      delivery === null
        ? null
        : delivery.unresolvedReason !== null
          ? t.page.unresolved[delivery.unresolvedReason]
          : route
            ? t.page.route
            : [t.page.shipping, delivery.warehouseName].filter(Boolean).join(' · ');
    const tag = address.id === order.stopAddressId ? t.page.stopAddress : address.isBilling ? t.page.billing : null;
    return (
      <PickRow
        title={address.line1}
        sub={[address.cityLine, tag, where].filter(Boolean).join(' · ')}
        subTone={delivery?.unresolvedReason ? 'warn' : 'muted'}
        action={t.page.change}
        onPress={() => router.push('/order/address')}
        accessibilityLabel={address.label}
        testID="staff-order-address"
      />
    );
  })();

  const dayChips = (() => {
    if (delivery === null) return <DayChips mode="placeholder" text={null} />;
    if (delivery.unresolvedReason !== null) return <DayChips mode="placeholder" text={t.page.unresolved[delivery.unresolvedReason]} />;
    if (!route) return <DayChips mode="placeholder" text={t.page.carrierDay} />;
    if (delivery.availableDates.length === 0) return <DayChips mode="placeholder" text={t.page.noDates} />;
    return <DayChips mode="dates" dates={delivery.availableDates} selected={order.deliveryDate} onSelect={order.setDeliveryDate} />;
  })();

  const deliveryDone = delivery !== null && delivery.unresolvedReason === null && (!route || order.deliveryDate !== null);
  const creditLine = customer === null ? null : customerCreditLineOf(customer, 'page');
  const badge = customer === null ? null : customerBadgeOf(customer);
  const chosen = order.paymentRows.find((row) => row.key === order.payment);

  const submit = async () => {
    if (await order.submit()) router.replace('/order/done');
  };

  return (
    <View style={styles.screen} testID="staff-order-screen">
      <OperationsStackHeader
        subtitleLines={1}
        title={t.page.title}
        subtitle={subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="staff-order-header"
      />

      <FormScroll contentContainerStyle={styles.body} testID="staff-order-body">
        <OrderSection
          n={1}
          state={customer === null ? 'active' : 'ok'}
          title={t.page.sections.customer}
          testID="staff-order-customer-section"
        >
          {customer === null ? (
            <PickRow
              title={t.page.customerEmpty}
              sub={t.page.customerEmptyHint}
              subTone="faint"
              state="empty"
              action={t.page.search}
              onPress={() => router.push('/order/customer')}
              accessibilityLabel={t.page.customerEmpty}
              testID="staff-order-customer"
            />
          ) : (
            <PickRow
              title={customer.name}
              badge={badge?.tone === 'warn' ? <OperationsStatusBadge label={badge.label} tone={BADGE_TONE.warn} /> : undefined}
              sub={creditLine?.text ?? ''}
              subTone={creditLine?.tone ?? 'muted'}
              action={t.page.change}
              onPress={() => router.push('/order/customer')}
              accessibilityLabel={customer.name}
              testID="staff-order-customer"
            />
          )}
        </OrderSection>

        <OrderSection
          n={2}
          state={customer === null ? 'wait' : deliveryDone ? 'ok' : 'active'}
          title={t.page.sections.delivery}
          hint={customer === null ? t.page.after.customer : undefined}
          testID="staff-order-delivery-section"
        >
          {addressRow}
          {dayChips}
        </OrderSection>

        <OrderSection
          n={3}
          state={!warehouseKnown ? 'wait' : hasLines && linesOk ? 'ok' : 'active'}
          title={retailOnly ? t.page.sections.productsRetail : t.page.sections.products}
          hint={warehouseKnown ? undefined : t.page.after.address}
          action={
            warehouseKnown && order.lines.length > 0 ? (
              <TextAction
                label={t.page.addMore}
                onPress={() => router.push('/order/products')}
                compactEdges="all"
                testID="staff-order-add-more"
              />
            ) : undefined
          }
          testID="staff-order-products-section"
        >
          {order.lines.length === 0 ? (
            <SecondaryButton
              label={t.page.addProducts}
              icon="plus"
              elevation="flat"
              disabled={!warehouseKnown}
              onPress={() => router.push('/order/products')}
              testID="staff-order-add-products"
            />
          ) : (
            <>
              <View style={styles.lines}>
                {order.lines.map((line) =>
                  isAdmin ? (
                    <OrderLineAdminRow
                      key={line.variantId}
                      line={line}
                      issue={lineIssueOf(line, order.shipping)}
                      onQty={(qty) => order.setLineQty(line.variantId, qty)}
                      channel={customer?.channel ?? 'b2c'}
                      onPrice={(cents) => order.setLinePrice(line.variantId, cents)}
                    />
                  ) : (
                    <OrderLineRow
                      key={line.variantId}
                      line={line}
                      issue={lineIssueOf(line, order.shipping)}
                      onQty={(qty) => order.setLineQty(line.variantId, qty)}
                    />
                  ),
                )}
              </View>
              <View style={styles.subtotal}>
                <Text style={styles.subtotalLabel}>{t.page.subtotal}</Text>
                <Text style={styles.subtotalValue}>{`~${money(order.totalCents)}`}</Text>
              </View>
            </>
          )}
        </OrderSection>

        <OrderSection
          n={4}
          state={!hasLines ? 'wait' : chosen?.enabled ? 'ok' : 'active'}
          title={t.page.sections.payment}
          testID="staff-order-payment-section"
        >
          {order.paymentRows.map((row) => (
            <PayRow key={row.key} row={row} selected={order.payment === row.key} onSelect={() => order.setPayment(row.key)} />
          ))}
        </OrderSection>
      </FormScroll>

      <SubmitBar
        why={order.footer.text}
        label={
          order.sending
            ? t.page.sending
            : order.footer.ready
              ? fillCopy(t.page.submitTotal, { total: money(order.totalCents) })
              : t.page.submit
        }
        disabled={!order.footer.ready || order.sending}
        onPress={() => void submit()}
        testID="staff-order-footer"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['9xl'],
    gap: operationsTheme.space.md,
  },
  lines: { gap: operationsTheme.space.xs },
  subtotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  subtotalLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  subtotalValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
});
