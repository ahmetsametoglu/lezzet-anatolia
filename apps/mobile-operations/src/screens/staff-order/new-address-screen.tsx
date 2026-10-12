import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { SubmitBar } from './components/submit-bar';
import { useStaffOrderContext } from './staff-order-context';
import { useNewAddress } from './use-new-address.hook';

/* Yeni teslim adresi: kaydedilince müşterinin defterine eklenir, seçili adres olur ve sipariş sayfasına dönülür. */

const n = t.newAddress;

export function StaffNewAddressScreen() {
  const router = useRouter();
  const order = useStaffOrderContext();
  const form = useNewAddress(order.customer);

  const submit = async () => {
    const address = await form.submit();
    if (address === null) return;
    order.addAddress(address);
    router.dismissTo('/order');
  };

  return (
    <View style={styles.screen} testID="staff-order-new-address-screen">
      <OperationsStackHeader
        subtitleLines={1}
        title={n.title}
        subtitle={order.customer?.name ?? ''}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="staff-order-new-address-header"
      />
      <FormScroll contentContainerStyle={styles.body} testID="staff-order-new-address-body">
        <TextField
          label={n.recipient}
          value={form.recipient}
          onChangeText={form.setRecipient}
          accessibilityLabel={n.recipient}
          content="name"
          accent={form.block === 'recipient'}
          density="compact"
          testID="staff-order-new-address-recipient"
        />
        <TextField
          label={n.phone}
          value={form.phone}
          onChangeText={form.setPhone}
          accessibilityLabel={n.phone}
          content="tel"
          accent={form.block === 'phone'}
          density="compact"
          testID="staff-order-new-address-phone"
        />
        <TextField
          label={n.line1}
          value={form.line1}
          onChangeText={form.setLine1}
          accessibilityLabel={n.line1}
          content="streetAddress"
          accent={form.block === 'line1'}
          density="compact"
          testID="staff-order-new-address-line1"
        />
        <TextField
          label={n.line2}
          value={form.line2}
          onChangeText={form.setLine2}
          placeholder={n.optional}
          accessibilityLabel={n.line2}
          content="addressLine2"
          density="compact"
          testID="staff-order-new-address-line2"
        />
        <View style={styles.pair}>
          <View style={styles.postal}>
            <TextField
              label={n.postalCode}
              value={form.postalCode}
              onChangeText={form.setPostalCode}
              accessibilityLabel={n.postalCode}
              content="postalCode"
              accent={form.block === 'postalCode'}
              density="compact"
              testID="staff-order-new-address-postal"
            />
          </View>
          <View style={styles.city}>
            <TextField
              label={n.city}
              value={form.city}
              onChangeText={form.setCity}
              accessibilityLabel={n.city}
              content="city"
              accent={form.block === 'city'}
              density="compact"
              testID="staff-order-new-address-city"
            />
          </View>
        </View>
      </FormScroll>
      <SubmitBar
        why={form.block === null ? n.why.ready : n.why[form.block]}
        label={form.sending ? n.sending : n.submit}
        disabled={form.block !== null || form.sending || order.customer === null}
        onPress={() => void submit()}
        testID="staff-order-new-address-footer"
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
    gap: operationsTheme.space.lg,
  },
  pair: { flexDirection: 'row', gap: operationsTheme.space.md },
  postal: { width: operationsTheme.size.stepValue * 2 },
  city: { flex: 1 },
});
