import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { ADDRESS_ROW_HEIGHT, AddressRow } from './components/address-row';
import { ListMessage } from './components/list-message';
import { ListStatus } from './components/search-box';
import { useStaffOrderContext } from './staff-order-context';

/*
  Teslim adresi seçici: müşterinin defteri, seçili adres işaretli gelir. Adres depoyu ve teslim gününü belirler; seçilince sayfaya
  dönülür ve gün yeniden sorulur.
*/

const a = t.addressPicker;

export function StaffAddressPickerScreen() {
  const router = useRouter();
  const order = useStaffOrderContext();
  const list = Array.isArray(order.addresses) ? order.addresses : [];

  const status =
    order.addresses === 'loading' || order.addresses === null
      ? a.loading
      : order.addresses === 'error'
        ? a.error
        : list.length === 0
          ? a.none
          : fillCopy(a.count, { n: String(list.length) });

  const message =
    order.addresses === 'error' ? (
      <ListMessage
        title={t.page.addressError}
        body={t.page.addressErrorHint}
        height={ADDRESS_ROW_HEIGHT}
        onPress={order.reloadAddresses}
        testID="staff-order-address-error"
      />
    ) : order.addresses === 'loading' || order.addresses === null ? null : (
      <ListMessage title={a.emptyTitle} body={a.emptyBody} height={ADDRESS_ROW_HEIGHT} testID="staff-order-address-empty" />
    );

  return (
    <View style={styles.screen} testID="staff-order-address-picker">
      <OperationsStackHeader
        subtitleLines={1}
        title={a.title}
        subtitle={order.customer?.name ?? ''}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="staff-order-address-picker-header"
      />
      <View style={styles.top}>
        <SecondaryButton
          label={a.newAddress}
          icon="plus"
          elevation="flat"
          disabled={order.customer === null}
          onPress={() => router.push('/order/new-address')}
          testID="staff-order-new-address"
        />
        <ListStatus text={status} testID="staff-order-address-status" />
      </View>
      <FlatList
        data={list}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => (
          <AddressRow
            address={item}
            selected={item.id === order.addressId}
            onPress={() => {
              if (item.id !== order.addressId) order.selectAddress(item.id);
              router.back();
            }}
          />
        )}
        getItemLayout={(_, index) => ({ length: ADDRESS_ROW_HEIGHT, offset: ADDRESS_ROW_HEIGHT * index, index })}
        ListEmptyComponent={message}
        contentContainerStyle={styles.list}
        testID="staff-order-address-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  top: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    gap: operationsTheme.space.lg,
  },
  list: { paddingHorizontal: operationsTheme.space['5xl'], paddingBottom: operationsTheme.space['8xl'] },
});
