import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy as t } from '../copy';
import { StepCard, StepHeading, type DeliveryState } from './delivery-step';

interface DeliveryBoxesStepProps {
  delivery: DeliveryState;
  boxesLeft: number;
}

/**
 * Kutular teslimin ön koşuludur; kutusuz durak sessiz geçilmez, çünkü kutu zorunlu olduğuna göre bu bir arızadır ve ekran onu adıyla
 * söyler.
 */
export function DeliveryBoxesStep({ delivery, boxesLeft }: DeliveryBoxesStepProps) {
  if (delivery.boxes.length === 0) {
    return (
      <StepCard>
        <StepHeading n={1} label={t.delivery.boxes.heading0} testID="courier-boxes-heading" />
        <OperationsNoticeBlock
          variant="error"
          title={t.delivery.boxes.missing.title}
          description={t.delivery.boxes.missing.body}
          testID="courier-boxes-missing"
        />
      </StepCard>
    );
  }

  return (
    <StepCard tone={boxesLeft === 0 ? 'done' : 'pending'}>
      <StepHeading
        n={1}
        label={fillCopy(t.delivery.boxes.heading, {
          scanned: String(delivery.scannedBoxCount),
          total: String(delivery.boxes.length),
        })}
        testID="courier-boxes-heading"
      />
      {/* Satır kodu yazar, sıra numarasını değil, çünkü kurye yığından kutuyu kartondaki koda bakarak seçer; araca binmemiş kutu kapıda bulunamaz. */}
      <View style={styles.boxRows}>
        {delivery.boxes.map((box) => {
          const scanned = delivery.isBoxScanned(box.code);
          return (
            <View key={box.code} style={styles.boxRow} testID={`courier-box-${box.boxNo}`}>
              <View style={[styles.boxNo, scanned ? styles.boxNoDone : null]}>
                <Text style={[styles.boxNoText, scanned ? styles.boxNoTextDone : null]}>
                  {scanned ? '✓' : String(box.boxNo)}
                </Text>
              </View>
              <Text style={[styles.boxCode, scanned ? styles.boxCodeDone : null]}>
                {fillCopy(t.delivery.boxes.rowCode, { code: box.code })}
              </Text>
              <Text style={styles.boxState}>
                {scanned
                  ? t.delivery.boxes.rowDone
                  : box.loadedAt === null
                    ? t.delivery.boxes.rowNotLoaded
                    : t.delivery.boxes.rowLoaded}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={boxesLeft === 0 ? styles.boxComplete : styles.boxNote}>
        {boxesLeft === 0 ? t.delivery.boxes.complete : t.delivery.boxes.pending}
      </Text>
    </StepCard>
  );
}

const styles = StyleSheet.create({
  boxRows: { gap: operationsTheme.space.sm },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /** Kare rozet, daire değil, çünkü daire durak listesinin işaretidir. */
  boxNo: {
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxNoDone: {
    backgroundColor: operationsTheme.colors['olive-bg'],
    borderColor: operationsTheme.colors['olive-bg'],
  },
  boxNoText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  boxNoTextDone: { color: operationsTheme.colors['olive-dark'] },
  boxCode: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  boxCodeDone: { color: operationsTheme.colors['olive-dark'] },
  boxState: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /** "Hepsi verildi" zeytin tonla yazılır ki kurye kapıdan ayrılabileceğini renkten de okusun. */
  boxComplete: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors['olive-dark'],
  },
  boxNote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
});
