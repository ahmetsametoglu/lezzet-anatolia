import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { SaleRecord } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@/components/ui/form-scroll';
import { LoadingState } from '@/components/ui/loading-state';
import { TextAction } from '@/components/ui/text-action';
import { fetchRecentSales } from '@/lib/api/sale';
import { money } from '@/lib/operations/money';
import { stampOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { saleCopy } from './copy';

/*
  SON SATIŞLAR — `/sale/history` (kullanıcı isteği 26.08: "kaydedilen satışı görebileceğim bir yer
  olmalı; kim yaptıysa o da görünsün").

  Bu ekran bir DÖKÜM değil, satış anının kontrolüdür: "az önce yazdığım kayıt ne oldu, kim
  yazmış". Satan kişi ayrı bir kolondan değil, zaten tutulan izden gelir (`order_status_log`un
  `completed` aktörü — uç künyesi). Sepet bağlamına GİRMEZ: kendi okuması var, satışla durum
  paylaşmaz. Tavan uç tarafında bilinçli (son 30); geçmiş dökümü muhasebe/web'in işidir.
*/

const t = saleCopy;

type HistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sales: SaleRecord[] };

export function SaleHistoryScreen() {
  const router = useRouter();
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    void fetchRecentSales().then((result) => {
      setState(result.error === null ? { status: 'ready', sales: result.data.sales } : { status: 'error' });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.screen} testID="sale-history-screen">
      <OperationsStackHeader
        title={t.history.title}
        subtitle={t.history.subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="sale-history-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.history.loading} label={t.history.loading} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.history.error.title}
            description={t.history.error.body}
            testID="sale-history-error"
          />
          <TextAction label={t.history.retry} onPress={load} testID="sale-history-retry" />
        </View>
      ) : state.sales.length === 0 ? (
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.history.empty.title}
            description={t.history.empty.body}
            testID="sale-history-empty"
          />
        </View>
      ) : (
        <FormScroll contentContainerStyle={styles.list} testID="sale-history-body">
          {state.sales.map((sale) => (
            <View key={sale.orderId} style={styles.row} testID={`sale-history-${sale.orderId}`}>
              <View style={styles.rowTop}>
                <Text style={styles.ref}>{sale.referenceNo ?? t.history.noRef}</Text>
                <Text style={styles.total}>{money(sale.totalCents)}</Text>
              </View>
              <Text style={styles.meta}>
                {[
                  stampOf(sale.createdAt),
                  fillCopy(t.history.lines, { n: String(sale.lineCount) }),
                  sale.paymentMethod === null ? null : t.history.method[sale.paymentMethod],
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ')}
              </Text>
              {/* Satan kişi "bilinmiyor" da olabilir (aktörsüz iz) — uydurulmaz, söylenir. */}
              <Text style={styles.seller}>
                {sale.sellerName === null
                  ? t.history.sellerUnknown
                  : fillCopy(t.history.seller, { name: sale.sellerName })}
              </Text>
            </View>
          ))}
        </FormScroll>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
    gap: operationsTheme.space.xl,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.lg,
  },
  row: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.card,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  ref: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  total: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  meta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  seller: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.micro,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.micro),
    color: operationsTheme.colors['olive-dark'],
  },
});
