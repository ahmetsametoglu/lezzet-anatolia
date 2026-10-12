import { Fragment, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsDashedRule } from '@/components/operations/dashed-rule';
import { OperationsIconButton } from '@/components/operations/icon-button';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy as t } from '../copy';
import { money } from '../courier-format';
import { StepCard, StepHeading, StepNote, type DeliveryState } from './delivery-step';

interface DeliveryGoodsStepProps {
  delivery: DeliveryState;
  n: number;
  locked: boolean;
}

/** Mal adımı bir özettir: teslim varsayılandır, red istisnadır ve başlıktaki artıyla açılan çekmeceden girilir. */
export function DeliveryGoodsStep({ delivery, n, locked }: DeliveryGoodsStepProps) {
  const [refuseOpen, setRefuseOpen] = useState(false);
  const refusedLines = delivery.lines.filter((line) => delivery.refusedQtyOf(line) > 0);
  const refusedCount = delivery.lines.reduce((sum, line) => sum + delivery.refusedQtyOf(line), 0);

  return (
    <StepCard locked={locked}>
      {/* Sayı çizilen listeden gelir, çünkü başlık dokunulabilir satırları tarif eder ve ayrışırsa ekranda olmayan bir kalemi vaat eder. */}
      <StepHeading
        n={n}
        label={fillCopy(t.delivery.goods.heading, { n: String(delivery.lines.length) })}
        action={
          <OperationsIconButton
            icon="plus"
            onPress={() => setRefuseOpen(true)}
            accessibilityLabel={t.delivery.goods.addRefused}
            testID="courier-goods-refuse-open"
          />
        }
      />
      {refusedLines.length === 0 ? (
        <Text style={styles.goodsSummary} testID="courier-goods-summary">
          {t.delivery.goods.allDelivered}
        </Text>
      ) : (
        <View style={styles.refusedList} testID="courier-goods-refused">
          {refusedLines.map((line, index) => (
            // Anahtar kalemin kimliğidir, çünkü ekrandaki satır uca giden düzeltmenin kendisidir ve sıra numarası tazelemede kayardı.
            <Fragment key={line.orderItemId}>
              {index === 0 ? null : <OperationsDashedRule color={operationsTheme.colors['sand-300']} />}
              <View style={styles.refusedRow}>
                <Text style={styles.refusedName}>{line.name}</Text>
                <Text style={styles.refusedQty}>
                  {fillCopy(t.delivery.goods.refusedOf, { n: String(delivery.refusedQtyOf(line)), total: String(line.qty) })}
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      )}
      {delivery.partialReturn ? (
        <StepNote tone="warn" testID="courier-partial-note">
          {t.delivery.goods.partialNote}
        </StepNote>
      ) : null}

      <BottomSheet visible={refuseOpen} title={t.delivery.goods.refuseTitle} onClose={() => setRefuseOpen(false)} testID="courier-refuse-sheet">
        <Text style={styles.refuseSubject}>{fillCopy(t.delivery.goods.refuseSubject, { n: String(delivery.lines.length) })}</Text>

        {/* Geri verilen adet ve tahsilat aynı dokunuştan doğar, bu yüzden canlı kartta birlikte durur. */}
        <View style={styles.refuseTotal}>
          <Text style={styles.refuseTotalValue}>{fillCopy(t.delivery.goods.refuseTotal, { n: String(refusedCount) })}</Text>
          <Text style={styles.refuseTotalNote}>
            {delivery.dueCents === null
              ? t.delivery.goods.refuseNoDue
              : fillCopy(t.delivery.goods.refuseDue, { amount: money(delivery.dueCents) })}
          </Text>
        </View>

        <StepNote tone="hint">{t.delivery.goods.refuseHint}</StepNote>

        {delivery.lines.map((line) => {
          const refused = delivery.refusedQtyOf(line);
          return (
            <OperationsSurface key={line.orderItemId} tone="card" padding="md" testID={`courier-refuse-${line.orderItemId}`}>
              <View style={styles.refuseRow}>
                <View style={styles.refuseNameBox}>
                  <Text style={styles.refuseName}>{line.name}</Text>
                  <Text style={styles.refuseOrdered}>{fillCopy(t.delivery.goods.ordered, { n: String(line.qty) })}</Text>
                </View>
                <OperationsStepperGroup
                  value={refused}
                  onChange={(next) => delivery.setRefusedQty(line, next)}
                  label={fillCopy(t.delivery.goods.refusedLabel, { name: line.name })}
                  tone={refused > 0 ? 'error' : 'neutral'}
                  testID={`courier-refuse-step-${line.orderItemId}`}
                />
              </View>
            </OperationsSurface>
          );
        })}

        {/* "Tamam" onay değil kapatmadır: her ± satıra ve tahsilata zaten yazıldı. */}
        <PrimaryButton
          label={t.delivery.goods.refuseDone}
          onPress={() => setRefuseOpen(false)}
          tone="ink"
          elevation="flat"
          testID="courier-refuse-done"
        />
      </BottomSheet>
    </StepCard>
  );
}

const styles = StyleSheet.create({
  goodsSummary: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
  refusedList: { gap: operationsTheme.space.md },
  refusedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  refusedName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  refusedQty: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.error,
  },
  refuseSubject: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  refuseTotal: {
    gap: operationsTheme.space['2xs'],
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.ink,
  },
  refuseTotalValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors['on-image'],
  },
  refuseTotalNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors['on-ink-muted'],
  },
  refuseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  refuseNameBox: { flex: 1, gap: operationsTheme.space['2xs'] },
  refuseName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  refuseOrdered: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
});
