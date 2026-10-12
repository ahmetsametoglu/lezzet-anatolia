import { TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy as t } from '../copy';
import { StepCard, StepHeading, StepNote, type DeliveryState } from './delivery-step';

interface DeliveryCodeStepProps {
  delivery: DeliveryState;
  n: number;
  locked: boolean;
}

/** Kapı kodu adımı: kurye müşteriye giden kodu sorar; kod alınamazsa kodsuz teslim açıktır ve kayda öyle düşer. */
export function DeliveryCodeStep({ delivery, n, locked }: DeliveryCodeStepProps) {
  const hint =
    delivery.doorCodeSentVia === 'whatsapp'
      ? t.delivery.code.hintWhatsapp
      : delivery.doorCodeSentVia === 'email'
        ? t.delivery.code.hintEmail
        : t.delivery.code.hintUnsent;

  return (
    <StepCard locked={locked} testID="courier-code">
      <StepHeading n={n} label={t.delivery.code.heading} testID="courier-code-heading" />
      {delivery.doorCodeSkipped ? (
        <View style={styles.skipped}>
          <StepNote tone="hint" testID="courier-code-skipped">
            {t.delivery.code.skipped}
          </StepNote>
          {/* Kilitli kodda geri dönüş yoktur, çünkü girilecek kod kabul edilmez. */}
          {delivery.doorCodeLocked ? null : (
            <TextAction label={t.delivery.code.undoSkip} onPress={() => delivery.setDoorCodeSkipped(false)} testID="courier-code-undo" />
          )}
        </View>
      ) : (
        <>
          {delivery.doorCodeLocked ? (
            <StepNote tone="error" testID="courier-code-locked">
              {t.delivery.code.locked}
            </StepNote>
          ) : (
            <>
              <StepNote tone="hint">{hint}</StepNote>
              <TextInput
                value={delivery.doorCode}
                onChangeText={delivery.setDoorCode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder={t.delivery.code.placeholder}
                placeholderTextColor={operationsTheme.colors.muted}
                accessibilityLabel={t.delivery.code.label}
                style={styles.codeInput}
                testID="courier-code-input"
              />
              {delivery.doorCodeError === null ? null : (
                <StepNote tone="error" testID="courier-code-error">
                  {delivery.doorCodeError}
                </StepNote>
              )}
            </>
          )}
          <TextAction label={t.delivery.code.skip} onPress={() => delivery.setDoorCodeSkipped(true)} testID="courier-code-skip" />
        </>
      )}
    </StepCard>
  );
}

const styles = StyleSheet.create({
  skipped: { gap: operationsTheme.space.sm },
  /** Rakamlar aralıklı ve iri yazılır, çünkü kurye kodu müşterinin söylediği hızda yazar ve göz ucuyla denetler. */
  codeInput: {
    height: operationsTheme.size.controlLg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    letterSpacing: operationsTheme.space.md,
    color: operationsTheme.colors.ink,
  },
});
