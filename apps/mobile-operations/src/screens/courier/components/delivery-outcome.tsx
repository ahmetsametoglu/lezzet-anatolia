import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsConfirmSheet } from '@/components/operations/confirm-sheet';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy as t } from '../copy';
import { StepNote, type DeliveryState } from './delivery-step';

interface DeliveryOutcomeProps {
  delivery: DeliveryState;
}

/** Ekranın altındaki sonuç alanı; sonuç toast'ta söylenir, çünkü kurye kutu okuturken sayfanın altına bakmıyordu. */
export function DeliveryOutcome({ delivery }: DeliveryOutcomeProps) {
  return (
    <>
      <View style={styles.footer}>
        {delivery.outcome === null ? (
          <>
            <PressableSurface
              onPress={delivery.deliver}
              disabled={!delivery.gateOpen}
              feedback="scale"
              style={[styles.primary, delivery.gateOpen ? styles.primaryReady : styles.primaryBlocked]}
              accessibilityLabel={delivery.ctaLabel}
              testID="courier-delivery-cta"
            >
              <Text style={styles.primaryLabel}>{delivery.ctaLabel}</Text>
            </PressableSurface>
            {delivery.gateNote === null ? null : (
              <Text style={styles.gateNote} testID="courier-delivery-gate">
                {delivery.gateNote}
              </Text>
            )}
            {/* Yola çıkmamış durakta iki sonuç da pasiftir, çünkü kapıya hiç gidilmemiş durağa "ulaşılamadı" yazılmaz. */}
            <View style={styles.outcomeRow}>
              <SecondaryButton
                label={t.delivery.cta.unreachable}
                onPress={() => delivery.openOutcome('unreachable')}
                disabled={!delivery.outcomeOpen}
                elevation="flat"
                grow
                testID="courier-outcome-unreachable"
              />
              <SecondaryButton
                label={t.delivery.cta.refused}
                onPress={() => delivery.openOutcome('refused')}
                disabled={!delivery.outcomeOpen}
                tone="error"
                elevation="flat"
                grow
                testID="courier-outcome-refused"
              />
            </View>
          </>
        ) : null}
      </View>

      {/* Bedel başlığın altında, düğmelerden önce yazılır ki okunmadan basılmasın. */}
      <OperationsConfirmSheet
        visible={delivery.outcome !== null && !delivery.finished}
        title={delivery.outcome === 'refused' ? t.delivery.outcome.refusedTitle : t.delivery.outcome.unreachableTitle}
        message={delivery.outcome === 'refused' ? t.delivery.outcome.refusedHint : t.delivery.outcome.unreachableHint}
        confirmLabel={t.delivery.outcome.confirm}
        cancelLabel={t.delivery.outcome.cancel}
        onConfirm={delivery.confirmOutcome}
        onCancel={delivery.cancelOutcome}
        busy={delivery.sending}
        busyLabel={t.delivery.cta.sending}
        testID="courier-outcome-sheet"
      >
        {/* Çipler yalnız hızlı doldurucudur ve nötrdür; sebep serbest metindir, çünkü liste kuryeyi en yakın seçeneğe bastırırdı. */}
        <View style={styles.chipWrap}>
          {(delivery.outcome === 'refused' ? t.delivery.outcome.refusedChips : t.delivery.outcome.unreachableChips).map((chip) => (
            <OperationsChoiceChip
              key={chip}
              label={chip}
              selected={delivery.outcomeNote === chip}
              onPress={() => delivery.setOutcomeNote(chip)}
              testID={`courier-outcome-chip-${chip}`}
            />
          ))}
        </View>
        <TextInput
          value={delivery.outcomeNote}
          onChangeText={delivery.setOutcomeNote}
          placeholder={t.delivery.outcome.notePlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          accessibilityLabel={t.delivery.outcome.noteLabel}
          style={styles.noteInput}
          testID="courier-outcome-note"
        />
        {delivery.noteError === null ? null : (
          <StepNote tone="error" testID="courier-outcome-note-error">
            {delivery.noteError}
          </StepNote>
        )}
      </OperationsConfirmSheet>
    </>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.lg,
    paddingBottom: operationsTheme.space['3xl'],
  },
  primary: {
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
  },
  primaryReady: { backgroundColor: operationsTheme.colors.olive },
  primaryBlocked: { backgroundColor: operationsTheme.colors['disabled-fill'] },
  primaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.card,
    textAlign: 'center',
  },
  gateNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
  outcomeRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.sm },
  /** Not girdisi sabit boyludur, çünkü dolgudan türeyen yükseklik punto değişince çekmecedeki düğmelerle hizayı bozuyordu. */
  noteInput: {
    height: operationsTheme.size.controlMd,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
});
