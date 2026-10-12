import { formatNetQuantity, type TextSegment } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import { ALLERGEN_LABELS, NUTRITION_KEYS, resolveLocalizedText } from '@lezzet/types';
import type { CatalogProductDetail, Nutrition, ProductAllergen } from '@lezzet/types';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fill, type Messages } from './product-copy';

/** Vurgulu/vurgusuz parçaları tek `Text` altında dizer (kalın parça `strong` kademesiyle). */
function SegmentText({ segments, style, strongStyle }: { segments: TextSegment[]; style: object; strongStyle: object }) {
  return (
    <Text style={style}>
      {segments.map((segment, index) => (
        <Text key={index} style={segment.strong ? strongStyle : undefined}>
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

/** Alerjen kodları görünen ada — sözlük şemanın yanında (`ALLERGEN_LABELS`), liste virgülle kurulur. */
function allergenList(codes: ProductAllergen[], locale: Locale): string {
  return codes.map((code) => resolveLocalizedText(ALLERGEN_LABELS[code], locale)).join(', ');
}

/**
 * Beyan tablosunu tek satıra indirger: dolu kalemler INCO sırasıyla "Ad değer" çifti olur. Enerji iki birimi tek kalemde taşır,
 * ayrı satırlar aynı ölçümü iki kalem gibi okuturdu.
 */
function nutritionLine(nutrition: Nutrition, t: Messages): string {
  const parts: string[] = [];
  if (nutrition.energyKj !== null || nutrition.energyKcal !== null) {
    const kj = nutrition.energyKj === null ? null : `${nutrition.energyKj} kJ`;
    const kcal = nutrition.energyKcal === null ? null : `${nutrition.energyKcal} kcal`;
    parts.push(`${t.nutrition.energy} ${[kj, kcal].filter((v) => v !== null).join(' / ')}`);
  }
  const grams: Partial<Record<keyof Nutrition, string>> = {
    fatG: t.nutrition.fat,
    saturatedFatG: t.nutrition.saturatedFat,
    carbohydrateG: t.nutrition.carbohydrate,
    sugarsG: t.nutrition.sugars,
    proteinG: t.nutrition.protein,
    saltG: t.nutrition.salt,
  };
  for (const key of NUTRITION_KEYS) {
    const label = grams[key];
    const value = nutrition[key];
    if (label === undefined || value === null) continue;
    parts.push(`${label} ${value} g`);
  }
  return parts.join(' · ');
}

interface ProductDeclarationProps {
  declaration: CatalogProductDetail['declaration'];
  /** Seçili boyun net miktarı; besin bölümünün altında yazılır, yoksa satır çizilmez. */
  netQuantity: number | null;
  netUnit: 'g' | 'ml' | null;
  t: Messages;
  locale: Locale;
}

/** Yasal beyanın akordeonları (içindekiler · besin değerleri · saklama); üst ve alt kenar düz mürekkep, aralar kesik kum. */
export function ProductDeclaration({ declaration, netQuantity, netUnit, t, locale }: ProductDeclarationProps) {
  const [open, setOpen] = useState({ ingredients: false, nutrition: false, storage: false });
  const toggle = (key: keyof typeof open) => setOpen((current) => ({ ...current, [key]: !current[key] }));

  return (
    <View style={styles.accordion}>
      <PressableSurface
        onPress={() => toggle('ingredients')}
        feedback="opacity"
        style={styles.head}
        accessibilityLabel={t.accordion.ingredients}
        testID="product-acc-ingredients"
      >
        <Text style={styles.title}>{t.accordion.ingredients}</Text>
        <Text style={styles.caret}>▾</Text>
      </PressableSurface>
      {open.ingredients ? (
        <View style={styles.body}>
          {declaration.ingredients === null ? null : (
            <SegmentText segments={declaration.ingredients} style={styles.text} strongStyle={styles.strong} />
          )}
          {declaration.allergens.length === 0 ? null : (
            <Text style={styles.allergenLine} testID="product-allergens">
              {fill(t.accordion.allergens, 'list', allergenList(declaration.allergens, locale))}
            </Text>
          )}
          {declaration.traces.length === 0 ? null : (
            <Text style={styles.text}>{fill(t.accordion.traces, 'list', allergenList(declaration.traces, locale))}</Text>
          )}
        </View>
      ) : null}

      <PressableSurface
        onPress={() => toggle('nutrition')}
        feedback="opacity"
        style={[styles.head, styles.divided]}
        accessibilityLabel={t.accordion.nutrition}
        testID="product-acc-nutrition"
      >
        <Text style={styles.title}>{t.accordion.nutrition}</Text>
        <Text style={styles.caret}>▾</Text>
      </PressableSurface>
      {open.nutrition ? (
        <View style={styles.body}>
          {declaration.nutrition === null ? null : (
            <Text style={styles.text}>{fill(t.accordion.per100, 'rows', nutritionLine(declaration.nutrition, t))}</Text>
          )}
          {netQuantity === null || netUnit === null ? null : (
            <Text style={styles.netWeight}>{fill(t.accordion.netQuantity, 'quantity', formatNetQuantity(netQuantity, netUnit, locale))}</Text>
          )}
        </View>
      ) : null}

      <PressableSurface
        onPress={() => toggle('storage')}
        feedback="opacity"
        style={[styles.head, styles.divided]}
        accessibilityLabel={t.accordion.storage}
        testID="product-acc-storage"
      >
        <Text style={styles.title}>{t.accordion.storage}</Text>
        <Text style={styles.caret}>▾</Text>
      </PressableSurface>
      {open.storage && declaration.storage !== null ? (
        <View style={styles.body}>
          <SegmentText segments={declaration.storage} style={styles.text} strongStyle={styles.strong} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  accordion: {
    marginVertical: theme.space.xs,
    marginHorizontal: theme.space.xl,
    borderTopWidth: theme.border.base,
    borderBottomWidth: theme.border.base,
    borderColor: theme.colors.ink,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.lg,
  },
  divided: {
    borderTopWidth: theme.border.base,
    borderStyle: 'dashed',
    borderColor: theme.colors['sand-400'],
  },
  title: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  caret: {
    color: theme.colors.muted,
  },
  body: {
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.lg,
    gap: theme.space.xs,
  },
  text: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  strong: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
  },
  allergenLine: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
  netWeight: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors.ink,
  },
}));
