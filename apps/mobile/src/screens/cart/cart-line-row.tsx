import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { TextAction } from '@/components/ui/text-action';
import { QuantityStepper } from '@/screens/customer-kit/quantity-stepper';

/*
  SEPET SATIRI — iki yüzeyde aynı iskelet (v3:411 ve v3:429): daire küçük resim · metin sütunu ·
  sağda adet sayacı ile "kaldır".

  İKİ TON, tasarımın kendi ayrımı:
  · `bundle` — HAZIR PAKET: koyu mürekkep kart, üstbaşlığı zeytin yeşili. Paket bir üründen
    fazlasıdır ve listede öyle görünmesi gerekiyor.
  · `product` — ÜRÜN: zeminsiz satır, altında kesikli ayraç.

  ROZETLER (indirimli fiyat · tükendi) YALNIZ ÜRÜN SATIRINDA: şablon paket kartında hiç rozet
  çizmiyor — paketin kendi içeriğinin durumu paket detayında konuşur.
*/

interface CartLineRowProps {
  name: string;
  /** İkinci satır: ürün için "500 g · 12,90 €", paket için içerik özeti. */
  subtitle: string;
  /** Satır toplamı — biçimlenmiş. */
  totalLabel: string;
  quantity: number;
  photoUri: string | null;
  tone: 'product' | 'bundle';
  /** Paket satırının üstbaşlığı ("HAZIR PAKET"); ürün satırında verilmez. */
  eyebrow?: string;
  /** "İndirimli fiyat" rozeti. */
  discountLabel?: string;
  /** "Tükendi — teslim edilemez" rozeti. */
  soldOutLabel?: string;
  removeLabel: string;
  removeAccessibilityLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  testID?: string;
}

export function CartLineRow({
  name,
  subtitle,
  totalLabel,
  quantity,
  photoUri,
  tone,
  eyebrow,
  discountLabel,
  soldOutLabel,
  removeLabel,
  removeAccessibilityLabel,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  onRemove,
  testID,
}: CartLineRowProps) {
  const { theme } = useUnistyles();
  const isBundle = tone === 'bundle';

  return (
    <View style={[styles.row, isBundle ? styles.bundleRow : styles.productRow]} testID={testID}>
      <AvatarThumb
        initial={name.slice(0, 1)}
        accessibilityLabel={name}
        photoUri={photoUri}
        size="lg"
        testID={testID === undefined ? undefined : `${testID}-photo`}
      />
      <View style={styles.text}>
        {eyebrow === undefined ? null : <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={[styles.name, isBundle ? styles.onInk : styles.onSand]}>{name}</Text>
        <Text style={[styles.subtitle, isBundle ? styles.onInkMuted : styles.onSandMuted]}>{subtitle}</Text>
        <Text style={[styles.total, isBundle ? styles.onInk : styles.onSand]}>{totalLabel}</Text>
        {discountLabel === undefined ? null : (
          <Text style={[styles.badge, styles.discountBadge]}>{discountLabel}</Text>
        )}
        {soldOutLabel === undefined ? null : (
          // Tükendi bir DURUM DEĞİŞİKLİĞİDİR (sepete girdikten sonra oldu): duyurulur.
          <Text style={[styles.badge, styles.soldOutBadge]} accessibilityRole="alert">
            {soldOutLabel}
          </Text>
        )}
      </View>
      <View style={styles.controls}>
        <QuantityStepper
          quantity={quantity}
          onDecrease={onDecrease}
          onIncrease={onIncrease}
          decreaseLabel={decreaseLabel}
          increaseLabel={increaseLabel}
          tone={isBundle ? 'ink' : 'sand'}
          testID={testID === undefined ? undefined : `${testID}-stepper`}
        />
        <TextAction
          label={removeLabel}
          onPress={onRemove}
          // Koyu kartta zeytin metin okunmuyor; orada terracotta da kirli duruyor — kaldır
          // eylemi ikinci sesli bir eylemdir ve şablonda ikisinde de sönük yazılı.
          tone={isBundle ? 'terracotta' : 'olive'}
          accessibilityHint={removeAccessibilityLabel}
          testID={testID === undefined ? undefined : `${testID}-remove`}
        />
      </View>
      {/* Ürün satırının kesikli alt ayracı — paket kartında yok (kartın kendi kenarı var). */}
      {isBundle ? null : <View style={[styles.divider, { borderBottomColor: theme.colors['sand-400'] }]} />}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  bundleRow: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.control,
    padding: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  productRow: {
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xs'],
  },
  text: { flex: 1, gap: theme.space['2xs'] },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    textTransform: 'uppercase',
    color: theme.colors['olive-light'],
  },
  name: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
  },
  subtitle: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
  },
  total: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    marginTop: theme.space['2xs'],
  },
  onInk: { color: theme.colors['sand-50'] },
  onInkMuted: { color: theme.colors['neutral-400'] },
  onSand: { color: theme.colors.ink },
  onSandMuted: { color: theme.colors.muted },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.badge,
    overflow: 'hidden',
  },
  discountBadge: {
    color: theme.colors.terracotta,
    backgroundColor: theme.colors['terracotta-bg'],
  },
  soldOutBadge: {
    color: theme.colors.error,
    backgroundColor: theme.colors['error-bg'],
  },
  controls: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomWidth: theme.border.base,
    borderStyle: 'dashed',
  },
}));
