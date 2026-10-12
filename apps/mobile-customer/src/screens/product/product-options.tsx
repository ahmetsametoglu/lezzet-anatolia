import { formatPrice, fromPriceLabel } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { CatalogFamilyMember, CatalogVariant } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { CirclePhoto } from '@lezzet/mobile-kit/src/components/ui/circle-photo';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { fill, type Messages } from './product-copy';

interface ProductFamilyRailProps {
  family: CatalogFamilyMember[];
  categoryName: string;
  t: Messages;
  locale: Locale;
}

/** Ailenin öteki çeşitleri; çip yığına sayfa eklemez, rotanın parametresi değişir ve geri tuşu geldiği yeri hatırlar. */
export function ProductFamilyRail({ family, categoryName, t, locale }: ProductFamilyRailProps) {
  const router = useRouter();
  const { theme } = useUnistyles();
  return (
    <View style={styles.familyBlock}>
      <Text style={styles.familyEyebrow}>{fill(t.family.browse, 'name', upperIn(categoryName, locale))}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.familyRailPull} contentContainerStyle={styles.familyRail}>
        {family.map((member) => (
          <PressableSurface
            key={member.slug}
            onPress={() => {
              if (!member.isCurrent) router.setParams({ slug: member.slug });
            }}
            feedback="scale-small"
            compact
            style={styles.familyChip}
            accessibilityLabel={member.label}
            testID={`product-family-${member.slug}`}
          >
            <CirclePhoto
              size={customerMetrics.productFamilyPhoto}
              initial={member.label.slice(0, 1)}
              initialFontSize={theme.text.note}
              image={member.image}
            />
            <View>
              <Text style={styles.familyName}>{member.label}</Text>
              <Text style={styles.familyPrice}>
                {/* Sayı başka ürünün en ucuz boyu, bu yüzden "'dan" ekiyle yazılır; fiyat yoksa satır boş kalır. */}
                {member.isCurrent ? t.family.current : (fromPriceLabel(member.fromPriceCents, locale) ?? '')}
              </Text>
            </View>
          </PressableSurface>
        ))}
      </ScrollView>
    </View>
  );
}

interface ProductVariantChipsProps {
  variants: CatalogVariant[];
  selectedId: string | undefined;
  onSelect: (variantId: string) => void;
  locale: Locale;
}

/** Boy çipleri; yalnız çok boylu üründe çizilir, tek boyda seçilecek bir şey yoktur. */
export function ProductVariantChips({ variants, selectedId, onSelect, locale }: ProductVariantChipsProps) {
  return (
    <View style={styles.variantRow}>
      {variants.map((option) => {
        const selected = option.id === selectedId;
        return (
          <PressableSurface
            key={option.id}
            onPress={() => onSelect(option.id)}
            feedback="scale-small"
            compact
            selected={selected}
            style={[styles.variantChip, selected ? styles.variantChipSelected : null]}
            accessibilityLabel={option.label}
            testID={`product-variant-${option.id}`}
          >
            <Text style={styles.variantLabel}>{option.label}</Text>
            <Text style={styles.variantPrice}>{option.priceCents === null ? '—' : formatPrice(option.priceCents, locale)}</Text>
          </PressableSurface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  familyBlock: {
    gap: theme.space.sm,
  },
  familyEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  /* Ray kenardan kenara kayar: negatif kenar payı ScrollView'a, iç dolgu içerik kabına; ikisi birden içerik kabına konursa ilk
     ve son kart sayfa boşluğunun altında kalır. */
  familyRailPull: {
    marginHorizontal: -theme.space['2xl'],
  },
  familyRail: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  /* Sol dolgu bilerek dar: fotoğraf o kenara yaslı. */
  familyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
    paddingLeft: theme.space.md,
    paddingRight: theme.space['2xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
  familyName: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  familyPrice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors['olive-dark'],
  },
  variantRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  variantChip: {
    gap: theme.space['2xs'],
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['3xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
  },
  variantChipSelected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  variantLabel: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  variantPrice: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.micro,
    color: theme.colors['olive-dark'],
  },
}));
