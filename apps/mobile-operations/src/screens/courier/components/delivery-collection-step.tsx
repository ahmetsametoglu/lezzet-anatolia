import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsAmountKeypad } from '@/components/operations/amount-keypad';
import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { centsToAmountText } from '@/lib/operations/money';
import { courierCopy as t } from '../copy';
import { money } from '../courier-format';
import { StepCard, StepHeading, StepNote, type DeliveryState } from './delivery-step';

interface DeliveryCollectionStepProps {
  delivery: DeliveryState;
  n: number;
  locked: boolean;
}

/** Kapıdaki tahsilat; borç yoksa adım yerine "ödendi" kartı çizilir, çünkü sorulacak bir şey kalmamıştır. */
export function DeliveryCollectionStep({ delivery, n, locked }: DeliveryCollectionStepProps) {
  const [keypadOpen, setKeypadOpen] = useState(false);

  if (delivery.dueCents === null) {
    return (
      <View style={styles.settled} testID="courier-settled">
        <Text style={styles.settledLabel}>{t.delivery.collection.settled}</Text>
        <Text style={styles.settledNote}>{t.delivery.collection.settledNote}</Text>
      </View>
    );
  }

  return (
    <StepCard tone="money" locked={locked} testID="courier-collection">
      <StepHeading n={n} tone="money" label={fillCopy(t.delivery.collection.heading, { amount: money(delivery.dueCents) })} />
      {/*
        Tutar bir girdi değil tuş takımını açan düğmedir, çünkü sistem klavyesi motorun tutarını görüş alanından çıkarıyordu.
        Artı/eksi yoktur: tutar motorun hesabıdır ve pazarlık edilebilir görünmemeli.
      */}
      <View style={styles.amountRow}>
        <PressableSurface
          onPress={() => setKeypadOpen(true)}
          feedback="scale"
          grow
          style={styles.amountInput}
          accessibilityLabel={t.delivery.collection.amountLabel}
          testID="courier-collection-amount"
        >
          <Text style={styles.amountValue}>{delivery.amountText} €</Text>
          <Text style={styles.keypadBadge}>{t.delivery.collection.keypadBadge}</Text>
        </PressableSurface>
      </View>
      {delivery.partialPayment ? (
        <Text style={styles.partialBadge} testID="courier-collection-partial">
          {t.delivery.collection.partial}
        </Text>
      ) : null}
      <View style={styles.methodRow}>
        {(['cash', 'card'] as const).map((option) => (
          <OperationsChoiceChip
            key={option}
            label={t.method[option]}
            selected={delivery.method === option}
            onPress={() => delivery.setMethod(option)}
            fill
            testID={`courier-method-${option}`}
          />
        ))}
      </View>
      {delivery.cashLimitWarning ? (
        <StepNote tone="warn" testID="courier-cash-warning">
          {t.delivery.collection.cashWarning}
        </StepNote>
      ) : null}
      {/* Kart Revolut'un uygulamasında çekilir; bu ekran yalnız tutarı söyler, ödeme eşleştirme işiyle tahsilata bağlanır. */}
      {delivery.method === 'card' ? (
        <StepNote tone="hint" testID="courier-card-note">
          {fillCopy(t.delivery.collection.cardNote, { amount: `${delivery.amountText} €` })}
        </StepNote>
      ) : null}
      <StepNote tone="hint">{t.delivery.collection.note}</StepNote>
      {delivery.collectionBlocked ? (
        <StepNote tone="error" testID="courier-collection-blocked">
          {t.delivery.collection.blocked}
        </StepNote>
      ) : null}

      <OperationsAmountKeypad
        visible={keypadOpen}
        title={t.delivery.collection.keypad.title}
        value={delivery.amountText}
        expected={centsToAmountText(delivery.dueCents)}
        expectedLabel={fillCopy(t.delivery.collection.keypad.expected, { amount: money(delivery.dueCents) })}
        // Birim prop'tur, çünkü tuş takımı mal kabulün adet kutusunda da kullanılır.
        unit="€"
        confirmLabel={t.delivery.collection.keypad.confirm}
        hint={t.delivery.collection.keypad.hint}
        footnote={t.delivery.collection.keypad.footnote}
        deleteLabel={t.delivery.collection.keypad.delete}
        onConfirm={(text) => {
          delivery.setAmountText(text);
          setKeypadOpen(false);
        }}
        onClose={() => setKeypadOpen(false)}
        testID="courier-collection-keypad"
      />
    </StepCard>
  );
}

const styles = StyleSheet.create({
  settled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    padding: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  settledLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors['olive-dark'],
  },
  settledNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  /** Yükseklik sabittir, çünkü büyük punto dolgudan türeyen yüksekliği punto değişince kaydırırdı. */
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 0,
    height: operationsTheme.size.controlAmount,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
  },
  /** Alanın dokunulabilir olduğunu söyleyen tek işaret. */
  keypadBadge: {
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.cream,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  amountValue: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.ink,
  },
  partialBadge: {
    alignSelf: 'flex-start',
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    color: operationsTheme.colors.terracotta,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  methodRow: { flexDirection: 'row', gap: operationsTheme.space.md },
});
