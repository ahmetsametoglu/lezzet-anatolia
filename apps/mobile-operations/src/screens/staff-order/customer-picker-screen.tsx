import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffCustomerOption } from '@lezzet/types';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { searchStaffCustomers } from '@/lib/api/staff-order';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsWorkplace } from '@/screens/operations/sections-context';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { CUSTOMER_ROW_HEIGHT, CustomerRow } from './components/customer-row';
import { ListMessage, ListTail } from './components/list-message';
import { ListStatus, SearchBox } from './components/search-box';
import { useStaffOrderContext } from './staff-order-context';
import { MIN_SEARCH_TERM, usePickerSearch, type PickerFetch } from './use-picker-search.hook';

/*
  Müşteri seçici: arama kutusu, yeni kayıt düğmesi ve durum satırı üstte sabittir, liste altlarında açılır. Liste iki harften önce
  boştur; ararken önceki sonuçlar soluk kalır ve yalnız satırların içi değişir.
*/

const p = t.customerPicker;

const fetchCustomers: PickerFetch<StaffCustomerOption> = async (query, cursor) => {
  const result = await searchStaffCustomers({ q: query ?? '', cursor: cursor ?? undefined });
  return result.error === null ? { rows: result.data.customers, nextCursor: result.data.nextCursor } : null;
};

export function StaffCustomerPickerScreen() {
  const router = useRouter();
  const order = useStaffOrderContext();
  const workplace = useOperationsWorkplace();
  const search = usePickerSearch(fetchCustomers, false);

  const pick = (customer: StaffCustomerOption) => {
    /* Aynı müşteri yeniden seçilirse sepet korunur; başka müşteri fiyatı değiştirdiği için siparişi baştan kurar. */
    if (order.customer?.id !== customer.id) order.selectCustomer(customer);
    router.back();
  };

  const short = search.term.trim().length < MIN_SEARCH_TERM;
  const statusText = short
    ? p.status.short
    : search.busy
      ? p.status.loading
      : search.status === 'error'
        ? p.status.error
        : search.rows.length === 0
          ? p.status.none
          : fillCopy(search.nextCursor === null ? p.status.count : p.status.more, { n: String(search.rows.length) });

  const message =
    search.status === 'error' ? (
      <ListMessage
        title={p.errorTitle}
        body={p.errorBody}
        height={CUSTOMER_ROW_HEIGHT}
        onPress={search.retry}
        testID="staff-order-customer-error"
      />
    ) : search.status === 'ready' && search.query !== null ? (
      <ListMessage
        title={fillCopy(p.noneTitle, { q: search.query ?? '' })}
        body={p.noneBody}
        height={CUSTOMER_ROW_HEIGHT}
        testID="staff-order-customer-none"
      />
    ) : (
      <ListMessage title={p.hintTitle} body={p.hintBody} height={CUSTOMER_ROW_HEIGHT} testID="staff-order-customer-hint" />
    );

  return (
    <View style={styles.screen} testID="staff-order-customer-picker">
      <OperationsStackHeader
        subtitleLines={1}
        title={p.title}
        subtitle={[p.subtitle, workplace].filter(Boolean).join(' · ')}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="staff-order-customer-picker-header"
      />
      <View style={styles.top}>
        <SearchBox
          value={search.term}
          onChange={search.setTerm}
          placeholder={p.placeholder}
          clearLabel={p.clear}
          autoFocus
          testID="staff-order-customer-search"
        />
        <SecondaryButton
          label={p.newRecord}
          icon="plus"
          elevation="flat"
          onPress={() => router.push('/order/new-customer')}
          testID="staff-order-new-customer"
        />
        <ListStatus text={statusText} busy={search.busy} testID="staff-order-customer-status" />
      </View>
      <FlatList
        data={search.rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <CustomerRow customer={item} onPress={() => pick(item)} />}
        getItemLayout={(_, index) => ({ length: CUSTOMER_ROW_HEIGHT, offset: CUSTOMER_ROW_HEIGHT * index, index })}
        ListEmptyComponent={message}
        ListFooterComponent={
          <ListTail
            loading={search.loadingMore}
            failed={search.tailFailed}
            onRetry={() => void search.loadMore()}
            testID="staff-order-customer-tail"
          />
        }
        onEndReached={() => void search.loadMore()}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={search.busy ? styles.dim : null}
        contentContainerStyle={styles.list}
        testID="staff-order-customer-list"
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
  dim: { opacity: operationsTheme.soldOutOpacity },
});
