import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { isBelowTargetMargin, revenueHtOf } from '@lezzet/domain-core';
import type { Channel } from '@lezzet/types';

import { OperationsProductThumb } from '@/components/operations/product-thumb';
import { OperationsStepperGroup, STEPPER_SM_HEIGHT } from '@/components/operations/stepper-group';
import { centsToAmountText, money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from '../copy';
import { lineSubOf, type LineIssue, type OrderLine } from '../staff-order-format';

/*
  Sayfadaki kalem satırının boyu sabittir: uyarı satırın kendi ikinci satırında yazar, sıfıra inen kalem "çıkarıldı · geri al" olarak
  yerinde kalır. Yöneticinin satırında fiyat kutusu ve durum satırı baştan vardır ki pazarlık yazılınca satır uzamasın.
*/

interface OrderLineRowProps {
  line: OrderLine;
  issue: LineIssue;
  onQty: (qty: number) => void;
}

/** Artı düğmesi depodaki kalanda durur; yarışla kalanın üstünde kalmış kalemde azaltmak yine açıktır. */
function maxOf(line: OrderLine): number | undefined {
  return line.availableQty === null ? undefined : Math.max(line.qty, line.availableQty);
}

function SubLine({ line, issue, onQty }: OrderLineRowProps) {
  if (issue?.kind === 'removed') {
    return (
      <Text style={[styles.sub, styles.subMuted]} numberOfLines={1}>
        {t.page.removed}
        <Text style={styles.undo} onPress={() => onQty(1)} accessibilityRole="button" testID={`staff-order-undo-${line.variantId}`}>
          {t.page.undo}
        </Text>
      </Text>
    );
  }
  const sub = lineSubOf(line, issue);
  return (
    <Text style={[styles.sub, sub.tone === 'error' ? styles.subError : styles.subMuted]} numberOfLines={1}>
      {sub.text}
    </Text>
  );
}

export function OrderLineRow({ line, issue, onQty }: OrderLineRowProps) {
  return (
    <View style={styles.line} testID={`staff-order-line-${line.variantId}`}>
      <OperationsProductThumb name={line.title} photoUri={line.imageUrl} size="md" />
      <View style={styles.texts}>
        <Text style={[styles.title, line.qty === 0 ? styles.titleRemoved : null]} numberOfLines={1}>
          {line.title}
        </Text>
        <SubLine line={line} issue={issue} onQty={onQty} />
      </View>
      <OperationsStepperGroup value={line.qty} onChange={onQty} label={t.page.qtyLabel} min={0} max={maxOf(line)} size="sm" />
    </View>
  );
}

interface OrderLineAdminRowProps extends OrderLineRowProps {
  channel: Channel;
  onPrice: (unitPriceCents: number) => void;
}

export function OrderLineAdminRow({ line, issue, onQty, channel, onPrice }: OrderLineAdminRowProps) {
  /* Kutunun ham metni yerelde tutulur: "29," gibi yarım bir yazım geçerli bir fiyat değildir ama silinmemeli. */
  const [priceText, setPriceText] = useState(() => centsToAmountText(line.unitPriceCents));
  const negotiated = line.unitPriceCents !== line.listPriceCents;
  const below = isBelowTargetMargin(revenueHtOf(channel, line.unitPriceCents, line.vatRate), line.costCents, line.targetMarginPercent);
  const problem = issue !== null && issue.kind !== 'removed' ? lineSubOf(line, issue).text : null;

  return (
    <View style={styles.lineAdmin} testID={`staff-order-line-${line.variantId}`}>
      <OperationsProductThumb name={line.title} photoUri={line.imageUrl} size="md" />
      <View style={styles.adminBody}>
        <Text style={[styles.title, line.qty === 0 ? styles.titleRemoved : null]} numberOfLines={1}>
          {line.title}
        </Text>
        <View style={styles.controls}>
          <Text style={[styles.sub, styles.subMuted, styles.grow]} numberOfLines={1}>
            {line.availableQty === null ? '' : fillCopy(t.page.stock, { n: String(line.availableQty) })}
          </Text>
          <OperationsStepperGroup value={line.qty} onChange={onQty} label={t.page.qtyLabel} min={0} max={maxOf(line)} size="sm" />
          <View style={[styles.price, negotiated ? styles.priceNegotiated : null]}>
            <TextInput
              value={priceText}
              onChangeText={(text) => {
                setPriceText(text);
                const cents = parseAmountToCents(text);
                if (cents !== null) onPrice(cents);
              }}
              keyboardType="decimal-pad"
              accessibilityLabel={t.page.priceLabel}
              style={styles.priceInput}
              testID={`staff-order-price-${line.variantId}`}
            />
            <Text style={styles.priceUnit}>€</Text>
          </View>
        </View>
        <View style={styles.status}>
          {issue?.kind === 'removed' ? (
            <SubLine line={line} issue={issue} onQty={onQty} />
          ) : problem !== null ? (
            <Text style={[styles.sub, styles.subError]} numberOfLines={1}>
              {problem}
            </Text>
          ) : negotiated ? (
            <>
              <Text style={styles.negotiated}>{fillCopy(t.page.negotiated, { price: money(line.listPriceCents) })}</Text>
              {below === true ? <Text style={[styles.sub, styles.subError]}>{t.page.belowMargin}</Text> : null}
            </>
          ) : (
            <Text style={[styles.sub, styles.subFaint]}>{t.page.listPrice}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    height: operationsTheme.size.controlAmount,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  lineAdmin: { flexDirection: 'row', gap: operationsTheme.space.lg, paddingVertical: operationsTheme.space.xs },
  adminBody: { flex: 1, minWidth: 0, gap: operationsTheme.space.xs },
  texts: { flex: 1, minWidth: 0, gap: operationsTheme.space['2xs'] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  grow: { flex: 1 },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  titleRemoved: { color: operationsTheme.colors['tab-inactive'], textDecorationLine: 'line-through' },
  sub: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta },
  subMuted: { color: operationsTheme.colors.muted },
  subFaint: { color: operationsTheme.colors['tab-inactive'] },
  subError: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
  },
  undo: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.olive,
  },
  /** Fiyat kutusu sayacın boyundadır; satırın denetim sırası tek hizada durur. */
  price: {
    width: operationsTheme.size.stepValue + operationsTheme.space['3xl'],
    height: STEPPER_SM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.card,
  },
  priceInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  priceUnit: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  priceNegotiated: { borderColor: operationsTheme.colors['warning-line'], backgroundColor: operationsTheme.colors['warning-bg'] },
  status: {
    height: operationsTheme.space['4xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
  },
  negotiated: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.terracotta,
    backgroundColor: operationsTheme.colors['terracotta-bg'],
    borderRadius: operationsTheme.radius.tight,
    paddingHorizontal: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space['2xs'],
    overflow: 'hidden',
  },
});
