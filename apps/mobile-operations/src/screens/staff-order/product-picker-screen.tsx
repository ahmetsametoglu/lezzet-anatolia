import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffVariantRow } from '@lezzet/types';

import { OperationsScanFab, scanFabRoom } from '@/components/operations/scan-fab';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStickyBar, STICKY_BAR_HEIGHT } from '@/components/operations/sticky-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fetchStaffVariants, scanStaffVariant } from '@/lib/api/staff-order';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { toastError, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { ListMessage, ListTail } from './components/list-message';
import { ListStatus, SearchBox } from './components/search-box';
import { VARIANT_ROW_HEIGHT, VariantRow } from './components/variant-row';
import { useStaffOrderContext } from './staff-order-context';
import { activeLines, lineFromRow, subtotalBasisOf } from './staff-order-format';
import { MIN_SEARCH_TERM, usePickerSearch, type PickerFetch } from './use-picker-search.hook';

/*
  Ürün seçici müşterinin fiyatını ve siparişin deposunun stoğunu gösterir; arama kutusu üstte sabittir, okutma yüzen düğmededir.
  Arama boşken liste katalog sırasıyla tamdır, sepet alttaki çubukta yazar.
*/

const p = t.productPicker;

export function StaffProductPickerScreen() {
  const router = useRouter();
  const order = useStaffOrderContext();
  const [scanOpen, setScanOpen] = useState(false);

  const customerId = order.customer?.id ?? null;
  const delivery = order.context?.delivery ?? null;
  const warehouseId = delivery?.warehouseId ?? null;

  const fetchVariants = useCallback<PickerFetch<StaffVariantRow>>(
    async (query, cursor) => {
      if (customerId === null) return null;
      const result = await fetchStaffVariants({ customerId, warehouseId, q: query ?? undefined, cursor: cursor ?? undefined });
      return result.error === null ? result.data : null;
    },
    [customerId, warehouseId],
  );
  const search = usePickerSearch(fetchVariants, true);

  const qtyById = useMemo(() => new Map(order.lines.map((line) => [line.variantId, line.qty])), [order.lines]);
  const setRowQty = order.setRowQty;
  const renderRow = useCallback(
    ({ item }: { item: StaffVariantRow }) => (
      <VariantRow row={item} qty={qtyById.get(item.variantId) ?? 0} shipping={order.shipping} onQty={setRowQty} />
    ),
    [order.shipping, qtyById, setRowQty],
  );

  const onScan = async (code: string) => {
    setScanOpen(false);
    if (customerId === null) return;
    const result = await scanStaffVariant({ customerId, warehouseId, code });
    if (result.error !== null) {
      toastError(p.scanFailed);
      return;
    }
    const data = result.data;
    if (data.status === 'unknown_code') {
      toastError(p.scanUnknown);
      return;
    }
    if (data.status === 'not_sellable' || lineFromRow(data.row, 1) === null) {
      toastError(p.scanNotSellable);
      return;
    }
    if (order.shipping && !data.row.shippable) {
      toastError(p.coldChain);
      return;
    }
    order.setRowQty(data.row, (qtyById.get(data.row.variantId) ?? 0) + data.qtyPerCode);
    toastSuccess(fillCopy(p.scanAdded, { name: data.row.title }));
  };

  const statusText = search.busy
    ? p.status.loading
    : search.term.trim().length > 0 && search.term.trim().length < MIN_SEARCH_TERM
      ? p.status.short
      : search.status === 'error'
        ? p.status.error
        : search.query === null
          ? p.status.all
          : search.rows.length === 0
            ? p.status.none
            : fillCopy(search.nextCursor === null ? p.status.count : p.status.more, { n: String(search.rows.length) });

  const message =
    search.status === 'error' ? (
      <ListMessage
        title={p.errorTitle}
        body={p.errorBody}
        height={VARIANT_ROW_HEIGHT}
        onPress={search.retry}
        testID="staff-order-variant-error"
      />
    ) : search.status === 'ready' && search.query !== null ? (
      <ListMessage
        title={fillCopy(p.noneTitle, { q: search.query })}
        body={p.noneBody}
        height={VARIANT_ROW_HEIGHT}
        testID="staff-order-variant-none"
      />
    ) : null;

  const lines = activeLines(order.lines);
  const subtitle = [
    order.customer?.name,
    order.customer?.channel === 'b2b' ? p.channelB2b : p.channelB2c,
    order.shipping ? p.shipping : delivery?.warehouseName,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.screen} testID="staff-order-product-picker">
      <OperationsStackHeader
        subtitleLines={1}
        title={p.title}
        subtitle={subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="staff-order-product-picker-header"
      />
      <View style={styles.top}>
        <SearchBox
          value={search.term}
          onChange={search.setTerm}
          placeholder={p.placeholder}
          clearLabel={p.clear}
          testID="staff-order-variant-search"
        />
        <ListStatus text={statusText} busy={search.busy} testID="staff-order-variant-status" />
      </View>
      <FlatList
        data={search.rows}
        keyExtractor={(row) => row.variantId}
        renderItem={renderRow}
        extraData={qtyById}
        getItemLayout={(_, index) => ({ length: VARIANT_ROW_HEIGHT, offset: VARIANT_ROW_HEIGHT * index, index })}
        ListEmptyComponent={message}
        ListFooterComponent={
          <ListTail
            loading={search.loadingMore}
            failed={search.tailFailed}
            onRetry={() => void search.loadMore()}
            testID="staff-order-variant-tail"
          />
        }
        onEndReached={() => void search.loadMore()}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={search.busy ? styles.dim : null}
        contentContainerStyle={[styles.list, { paddingBottom: scanFabRoom(STICKY_BAR_HEIGHT) }]}
        testID="staff-order-variant-list"
      />
      <OperationsStickyBar testID="staff-order-cart-bar">
        <PressableSurface
          onPress={() => router.back()}
          feedback="scale"
          style={styles.bar}
          accessibilityLabel={p.done}
          testID="staff-order-cart-done"
        >
          <Text style={styles.barText} numberOfLines={1}>
            {lines.length === 0
              ? p.barEmpty
              : fillCopy(p.bar, {
                  n: String(lines.length),
                  total: money(order.totalCents),
                  basis: order.customer === null ? '' : subtotalBasisOf(order.customer),
                })}
          </Text>
          <Text style={styles.barDone}>{p.done}</Text>
        </PressableSurface>
      </OperationsStickyBar>
      <OperationsScanFab
        icon="scan"
        accessibilityLabel={p.scan}
        onPress={() => setScanOpen(true)}
        lift={STICKY_BAR_HEIGHT}
        testID="staff-order-variant-scan"
      />
      <ScanSheet
        open={scanOpen}
        title={p.scanTitle}
        hint={p.scanHint}
        onClose={() => setScanOpen(false)}
        onScan={(code) => void onScan(code)}
        testID="staff-order-scan-sheet"
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
  /** Alt boşluk çizimde dairenin payından verilir: son satırın "+"sı dairenin altında kalmasın. */
  list: { paddingHorizontal: operationsTheme.space['5xl'] },
  dim: { opacity: operationsTheme.soldOutOpacity },
  bar: {
    height: operationsTheme.size.controlLg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['4xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.ink,
  },
  barText: {
    flexShrink: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['on-image'],
  },
  barDone: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-line'],
  },
});
