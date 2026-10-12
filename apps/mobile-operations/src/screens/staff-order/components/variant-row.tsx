import { memo } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffVariantRow } from '@lezzet/types';

import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { OperationsStepperGroup, STEPPER_SM_HEIGHT, STEPPER_SM_WIDTH } from '@/components/operations/stepper-group';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from '../copy';

/*
  Ürün seçicinin satırı: sağdaki yuvanın eni sabittir, ekle düğmesi sayaca dönüşünce artı parmağın altında kalır. Eklenemeyen satır
  gizlenmez, sebebi kendi ikinci satırında yazar.
*/

export const VARIANT_ROW_HEIGHT = operationsTheme.size.controlStack + operationsTheme.space.xs;

const p = t.productPicker;

interface VariantRowProps {
  row: StaffVariantRow;
  /** Sepetteki adet; sıfırsa ekle düğmesi çizilir. */
  qty: number;
  shipping: boolean;
  onQty: (row: StaffVariantRow, qty: number) => void;
}

function subOf(row: StaffVariantRow, qty: number, shipping: boolean): { text: string; tone: 'muted' | 'faint' | 'warn'; addable: boolean } {
  if (row.listPriceCents === null) return { text: p.notForSale, tone: 'faint', addable: false };
  if (shipping && !row.shippable) return { text: p.coldChain, tone: 'warn', addable: false };
  const price = money(row.listPriceCents);
  if (row.availableQty === null) return { text: fillCopy(p.rowSubNoWarehouse, { price }), tone: 'muted', addable: true };
  const n = String(row.availableQty);
  if (row.availableQty === 0 && qty === 0) return { text: fillCopy(p.soldOut, { price }), tone: 'warn', addable: false };
  if (qty > 0 && qty >= row.availableQty) return { text: fillCopy(p.allAdded, { price, n }), tone: 'muted', addable: true };
  return { text: fillCopy(p.rowSub, { price, n }), tone: 'muted', addable: true };
}

export const VariantRow = memo(function VariantRow({ row, qty, shipping, onQty }: VariantRowProps) {
  const sub = subOf(row, qty, shipping);
  return (
    <View style={styles.row} testID={`staff-order-variant-${row.variantId}`}>
      <OperationsProductThumb name={row.title} size="md" />
      <View style={styles.texts}>
        <Text style={[styles.title, sub.addable ? null : styles.titleOff]} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={[styles.sub, styles[sub.tone]]} numberOfLines={1}>
          {sub.text}
        </Text>
      </View>
      <View style={styles.slot}>
        {qty > 0 ? (
          <OperationsStepperGroup
            value={qty}
            onChange={(next) => onQty(row, next)}
            label={fillCopy(p.qtyLabel, { name: row.title })}
            min={0}
            max={row.availableQty === null ? undefined : Math.max(qty, row.availableQty)}
            size="sm"
            testID={`staff-order-variant-qty-${row.variantId}`}
          />
        ) : (
          <PressableSurface
            onPress={() => onQty(row, 1)}
            disabled={!sub.addable}
            feedback="scale-small"
            compact
            style={[styles.add, sub.addable ? null : styles.addOff]}
            accessibilityLabel={fillCopy(p.addLabel, { name: row.title })}
            testID={`staff-order-variant-add-${row.variantId}`}
          >
            <Text style={[styles.addGlyph, sub.addable ? null : styles.addGlyphOff]}>+</Text>
          </PressableSurface>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: VARIANT_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  texts: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  titleOff: { color: operationsTheme.colors['tab-inactive'] },
  sub: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta },
  muted: { color: operationsTheme.colors.muted },
  faint: { color: operationsTheme.colors['tab-inactive'] },
  warn: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
  },
  slot: { width: STEPPER_SM_WIDTH, alignItems: 'flex-end' },
  add: {
    width: STEPPER_SM_HEIGHT,
    height: STEPPER_SM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  addOff: { borderStyle: 'dashed', borderColor: operationsTheme.colors['sand-500'], backgroundColor: operationsTheme.colors.panel },
  addGlyph: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.icon,
    lineHeight: operationsTheme.text.icon,
    color: operationsTheme.colors['olive-dark'],
  },
  addGlyphOff: { color: operationsTheme.colors['tab-inactive'] },
});
