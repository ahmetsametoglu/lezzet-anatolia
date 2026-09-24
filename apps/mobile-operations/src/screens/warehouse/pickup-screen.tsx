import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ORDER_STATUS_LABELS, type PickupDeliverResponse, type PickupQueueOrderContract } from '@lezzet/types';

import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { centsToAmountText, money } from '@/lib/operations/money';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { warehouseCopy } from './copy';
import { usePickup, type PickupMethod } from './use-pickup.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  Gel-al teslimi: izinli müşteri hazır siparişini tezgâhtan alır; önce sipariş seçilir, sonra kutular okutulur, borç varsa para alınır ve teslim yazılır.
  Kural sunucudadır (bütün kutular okutulmadan teslim yazılmaz); ekran rampa ekranının iskeletiyle kuryenin tahsilat bloğundan kuruldu.
*/

const t = warehouseCopy;
const METHODS: readonly PickupMethod[] = ['cash', 'card', 'cheque'];

interface ResultRow {
  tone: 'done' | 'error';
  title: string;
  sub: string;
}

/** Kapının cevabını satıra çevirir; olumsuz dallar da ADLI — depocu ne olduğunu okur, tahmin etmez. */
function resultRowOf(data: PickupDeliverResponse, order: PickupQueueOrderContract): ResultRow {
  const r = t.pickup.result;
  const ref = order.referenceNo ?? '—';
  switch (data.status) {
    case 'ok': {
      const parts = [
        data.collectedCents > 0 ? fillCopy(r.okCollected, { amount: money(data.collectedCents), due: money(data.amountDueCents) }) : r.okSettled,
        data.collectionDeduped ? r.okDeduped : null,
        data.cashLimitExceeded ? r.cashLimit : null,
      ].filter(Boolean);
      return { tone: 'done', title: fillCopy(r.ok, { ref }), sub: parts.join(' · ') };
    }
    case 'boxes_missing':
      return { tone: 'error', title: fillCopy(r.boxesMissing, { nos: data.remainingBoxNos.join(', ') }), sub: ref };
    case 'not_ready':
      return { tone: 'error', title: fillCopy(r.notReady, { status: ORDER_STATUS_LABELS[data.currentStatus] }), sub: ref };
    case 'not_pickup':
      return { tone: 'error', title: r.notPickup, sub: ref };
    case 'forbidden':
      return { tone: 'error', title: r.forbidden, sub: ref };
    case 'not_found':
      return { tone: 'error', title: r.notFound, sub: ref };
    default:
      return { tone: 'error', title: r.failed, sub: ref };
  }
}

export function PickupScreen() {
  const router = useRouter();
  const { offline } = useWarehouseStatus();
  const pickup = usePickup();
  const [scanOpen, setScanOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [result, setResult] = useState<ResultRow | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const countLabel =
    pickup.status === 'error'
      ? t.pickup.countUnknown
      : pickup.orders.length === 0
        ? t.pickup.countNone
        : pickup.orders.length === 1
          ? t.pickup.countOne
          : fillCopy(t.pickup.count, { n: String(pickup.orders.length) });

  const handleScan = (code: string) => {
    setScanOpen(false);
    setScanNotice(pickup.scan(code) ? null : fillCopy(t.pickup.deliver.unknownCode, { code }));
  };

  const handleDeliver = async () => {
    const order = pickup.selected;
    if (!order) return;
    const data = await pickup.deliver();
    if (data === null) {
      setResult({ tone: 'error', title: fillCopy(t.pickup.result.failed, { reason: t.common.networkError }), sub: order.referenceNo ?? '—' });
      return;
    }
    setResult(resultRowOf(data, order));
  };

  const selected = pickup.selected;

  return (
    <View style={styles.screen} testID="warehouse-pickup">
      <OperationsScreenScroll
        title={t.pickup.title}
        caption={operationsCopy.sections.warehouse.tab}
        contentContainerStyle={styles.list}
        testID="warehouse-pickup-list"
      >
        <OperationsHeadBleed pad="5xl">
          <OperationsStackHeader
            title={t.pickup.title}
            subtitle={t.pickup.subtitle}
            onBack={() => router.back()}
            backLabel={t.common.back}
            testID="warehouse-pickup-header"
          />
        </OperationsHeadBleed>

        <Text style={styles.rule}>{t.pickup.rule}</Text>

        {!offline ? null : (
          <View style={styles.locked} testID="warehouse-pickup-locked">
            <Text style={styles.lockedTitle}>{t.pickup.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.pickup.locked.body}</Text>
          </View>
        )}

        {result === null ? null : (
          <View style={[styles.resultRow, result.tone === 'done' ? styles.resultDone : styles.resultError]} testID="warehouse-pickup-result">
            <View style={styles.rowHead}>
              {result.tone !== 'done' ? null : (
                <Icon name="check" size={operationsTheme.size.cardTileIcon} color={operationsTheme.colors['olive-dark']} />
              )}
              <Text style={styles.resultTitle}>{result.title}</Text>
            </View>
            <Text style={styles.resultSub}>{result.sub}</Text>
          </View>
        )}

        {/* ── SEÇİLİ SİPARİŞİN TESLİM PANELİ — liste üstünde, çünkü müşteri tezgâhta bekliyor ── */}
        {selected === null ? null : (
          <View style={styles.panel} testID="warehouse-pickup-panel">
            <Text style={styles.panelHeading}>{t.pickup.deliver.heading}</Text>
            <Text style={styles.panelTitle}>{`${selected.referenceNo ?? '—'} · ${selected.customerName ?? t.pickup.row.noCustomer}`}</Text>

            <Text style={styles.sectionHeading}>{t.pickup.deliver.boxesHeading}</Text>
            {selected.boxes.map((box) => {
              const done = pickup.scanned.has(box.code);
              return (
                <View key={box.code} style={styles.boxRow} testID={`warehouse-pickup-box-${box.code}`}>
                  <Text style={styles.boxTitle}>{fillCopy(t.pickup.deliver.boxRow, { no: String(box.boxNo) })}</Text>
                  <Text style={[styles.boxState, done ? styles.boxStateDone : null]}>{done ? t.pickup.deliver.scanned : t.pickup.deliver.pending}</Text>
                </View>
              );
            })}
            {scanNotice === null ? null : (
              <Text style={styles.errorText} accessibilityRole="alert" testID="warehouse-pickup-scan-notice">
                {scanNotice}
              </Text>
            )}
            {pickup.allBoxesScanned ? null : (
              <SecondaryButton label={t.pickup.deliver.scanCta} onPress={() => setScanOpen(true)} disabled={offline} testID="warehouse-pickup-scan" />
            )}

            {pickup.dueCents === 0 ? (
              <View style={styles.settled} testID="warehouse-pickup-settled">
                <Text style={styles.settledLabel}>{t.pickup.deliver.settled}</Text>
                <Text style={styles.settledNote}>{t.pickup.deliver.settledNote}</Text>
              </View>
            ) : (
              <View style={styles.collection} testID="warehouse-pickup-collection">
                <Text style={styles.sectionHeading}>{fillCopy(t.pickup.deliver.collectionHeading, { amount: money(pickup.dueCents) })}</Text>
                <PressableSurface
                  onPress={() => setKeypadOpen(true)}
                  feedback="scale"
                  style={styles.amountInput}
                  accessibilityLabel={t.pickup.deliver.amountLabel}
                  testID="warehouse-pickup-amount"
                >
                  <Text style={styles.amountValue}>{pickup.amountText} €</Text>
                  <Text style={styles.keypadBadge}>{t.pickup.deliver.keypadBadge}</Text>
                </PressableSurface>
                {pickup.partialPayment ? <Text style={styles.partialBadge}>{t.pickup.deliver.partial}</Text> : null}
                <View style={styles.methodRow}>
                  {METHODS.map((option) => (
                    <OperationsChoiceChip
                      key={option}
                      label={t.pickup.deliver.method[option]}
                      selected={pickup.method === option}
                      onPress={() => pickup.setMethod(option)}
                      fill
                      testID={`warehouse-pickup-method-${option}`}
                    />
                  ))}
                </View>
                {pickup.collectionBlocked && pickup.cashAccountId === null ? (
                  <Text style={styles.errorText} accessibilityRole="alert" testID="warehouse-pickup-collection-blocked">
                    {t.pickup.deliver.blocked}
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.ctaRow}>
              <SecondaryButton label={t.pickup.deliver.cancel} onPress={() => pickup.select(null)} testID="warehouse-pickup-cancel" />
              <PrimaryButton
                label={pickup.busy ? t.pickup.deliver.busy : t.pickup.deliver.cta}
                onPress={() => void handleDeliver()}
                disabled={offline || !pickup.canDeliver}
                grow
                testID="warehouse-pickup-deliver"
              />
            </View>
          </View>
        )}

        <Text style={styles.logHeading} testID="warehouse-pickup-count">{`${t.pickup.listHeading} · ${countLabel}`}</Text>
        {pickup.status === 'error' ? (
          <View style={styles.emptyBlock} testID="warehouse-pickup-error">
            <Text style={styles.emptyTitle}>{t.pickup.error.title}</Text>
            <Text style={styles.emptyBody}>{t.pickup.error.body}</Text>
            <SecondaryButton label={t.common.retry} onPress={pickup.reload} testID="warehouse-pickup-retry" />
          </View>
        ) : pickup.status === 'ready' && pickup.orders.length === 0 ? (
          <View style={styles.emptyBlock} testID="warehouse-pickup-empty">
            <Text style={styles.emptyTitle}>{t.pickup.empty.title}</Text>
            <Text style={styles.emptyBody}>{t.pickup.empty.body}</Text>
          </View>
        ) : (
          pickup.orders.map((order) => {
            const waiting = order.waitingDays === null ? t.pickup.row.waitingUnknown : fillCopy(t.pickup.row.waiting, { n: String(order.waitingDays) });
            const due = order.onAccount ? t.pickup.row.onAccount : order.amountDueCents > 0 ? fillCopy(t.pickup.row.due, { amount: money(order.amountDueCents) }) : t.pickup.row.paid;
            const isSelected = selected?.orderId === order.orderId;
            return (
              <PressableSurface
                key={order.orderId}
                onPress={() => pickup.select(isSelected ? null : order.orderId)}
                feedback="scale"
                style={[styles.orderRow, isSelected ? styles.orderRowSelected : null]}
                accessibilityLabel={`${order.referenceNo ?? '—'} · ${order.customerName ?? ''}`}
                testID={`warehouse-pickup-order-${order.orderId}`}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.orderTitle}>{`${order.referenceNo ?? '—'} · ${order.customerName ?? t.pickup.row.noCustomer}`}</Text>
                  <Text style={styles.orderWaiting}>{waiting}</Text>
                </View>
                <Text style={styles.orderMeta}>
                  {`${fillCopy(t.pickup.row.meta, { lines: String(order.lineCount), boxes: String(order.boxCount) })} · ${due}`}
                </Text>
              </PressableSurface>
            );
          })
        )}
      </OperationsScreenScroll>

      <ScanSheet
        open={scanOpen}
        title={t.pickup.deliver.scanTitle}
        hint={t.pickup.deliver.scanHint}
        onClose={() => setScanOpen(false)}
        onScan={handleScan}
        /* Simülasyon çipleri SEÇİLİ siparişin kutularıdır: kutu QR'ı havuzda yok, gerçek kodlar listeden gelir (D8'in kararı). */
        devCodes={(selected?.boxes ?? []).map((box) => ({ label: fillCopy(t.pickup.deliver.boxRow, { no: String(box.boxNo) }), code: box.code }))}
        testID="warehouse-pickup-scan-sheet"
      />

      {selected === null || pickup.dueCents === 0 ? null : (
        <OperationsAmountKeypad
          visible={keypadOpen}
          title={t.pickup.deliver.keypad.title}
          value={pickup.amountText}
          expected={centsToAmountText(pickup.dueCents)}
          expectedLabel={fillCopy(t.pickup.deliver.keypad.expected, { amount: money(pickup.dueCents) })}
          unit="€"
          confirmLabel={t.pickup.deliver.keypad.confirm}
          hint={t.pickup.deliver.keypad.hint}
          footnote={t.pickup.deliver.keypad.footnote}
          deleteLabel={t.pickup.deliver.keypad.delete}
          onConfirm={(text) => {
            pickup.setAmountText(text);
            setKeypadOpen(false);
          }}
          onClose={() => setKeypadOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.md,
  },
  rule: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
    lineHeight: operationsTheme.text.helper * 1.5,
  },
  locked: {
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    padding: operationsTheme.space.lg,
    gap: operationsTheme.space.xs,
  },
  lockedTitle: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors.ink },
  lockedBody: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.helper, color: operationsTheme.colors.muted },
  panel: {
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors.card,
    padding: operationsTheme.space.lg,
    gap: operationsTheme.space.md,
  },
  panelHeading: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  panelTitle: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors.ink },
  sectionHeading: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: operationsTheme.space.sm,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  boxTitle: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors.ink },
  boxState: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  boxStateDone: { color: operationsTheme.colors['olive-dark'], fontFamily: operationsTheme.font.body['700'] },
  settled: { gap: operationsTheme.space.xs },
  settledLabel: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors['olive-dark'] },
  settledNote: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.helper, color: operationsTheme.colors.muted },
  collection: { gap: operationsTheme.space.md },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingHorizontal: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.md,
  },
  amountValue: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['icon-sm'], color: operationsTheme.colors.ink },
  keypadBadge: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  partialBadge: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.terracotta },
  methodRow: { flexDirection: 'row', gap: operationsTheme.space.sm },
  errorText: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text.helper, color: operationsTheme.colors.terracotta },
  ctaRow: { flexDirection: 'row', gap: operationsTheme.space.md, alignItems: 'center' },
  logHeading: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body['700'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  orderRow: {
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.card,
    padding: operationsTheme.space.lg,
    gap: operationsTheme.space.xs,
  },
  orderRowSelected: { borderColor: operationsTheme.colors['olive-dark'] },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: operationsTheme.space.md },
  orderTitle: { flex: 1, fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors.ink },
  orderWaiting: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.terracotta },
  orderMeta: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.helper, color: operationsTheme.colors.muted },
  emptyBlock: {
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-300'],
    padding: operationsTheme.space.lg,
    gap: operationsTheme.space.sm,
  },
  emptyTitle: { fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors.ink },
  emptyBody: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.helper, color: operationsTheme.colors.muted },
  resultRow: {
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    padding: operationsTheme.space.lg,
    gap: operationsTheme.space.xs,
  },
  resultDone: { borderColor: operationsTheme.colors['olive-dark'], backgroundColor: operationsTheme.colors.card },
  resultError: { borderColor: operationsTheme.colors.terracotta, backgroundColor: operationsTheme.colors.card },
  resultTitle: { flex: 1, fontFamily: operationsTheme.font.body['700'], fontSize: operationsTheme.text['body-sm'], color: operationsTheme.colors.ink },
  resultSub: { fontFamily: operationsTheme.font.body['400'], fontSize: operationsTheme.text.helper, color: operationsTheme.colors.muted },
});
