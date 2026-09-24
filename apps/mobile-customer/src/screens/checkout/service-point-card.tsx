import {
  distanceLabel,
  formatPrice,
  openingLines,
  pointAddress,
  pointText,
  type CarrierTone,
  type ServicePointEntry,
} from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/checkout';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { carrierToneStyles } from './carrier-tone';

interface ServicePointCardProps {
  entry: ServicePointEntry;
  locale: Locale;
  tone: CarrierTone;
  selected: boolean;
  /** Açılış saatleri; haritanın alt kartında gösterilir. */
  showHours?: boolean;
  onPress?: () => void;
  testID?: string;
}

/**
 * Noktanın kartı: taşıyıcı, tür ve fiyat üstte; ad, adres ve uzaklık altında. Liste, haritanın alt kartı ve kargo bölümündeki seçim
 * aynı kartı çizer; web telefon görünümünün nokta kartıyla aynı düzen.
 */
export function ServicePointCard({
  entry: { point, option },
  locale,
  tone,
  selected,
  showHours = false,
  onPress,
  testID,
}: ServicePointCardProps) {
  const t = messages[locale];
  const hours = showHours ? openingLines(point.openingTimes, locale, t.point.closed) : null;
  const meta = [option.carrierName, point.kind ? t.point.kind[point.kind] : null].filter(Boolean).join(' · ');
  const place = [
    pointAddress(point),
    point.distanceM === null ? null : t.point.distance.replace('{distance}', distanceLabel(point.distanceM, locale)),
  ]
    .filter(Boolean)
    .join(' · ');
  const body = (
    <>
      <View style={styles.top}>
        <View style={[styles.dot, carrierToneStyles[tone]]} />
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        <Text style={styles.price}>{formatPrice(option.priceCents, locale)}</Text>
      </View>
      <Text style={styles.name}>{pointText(point.name)}</Text>
      <Text style={styles.place}>{place}</Text>
      {showHours ? <Text style={styles.hours}>{hours ? hours.join(' · ') : t.point.hoursUnknown}</Text> : null}
    </>
  );
  const frame = [styles.card, selected ? styles.selected : styles.idle];
  if (onPress === undefined) {
    return (
      <View style={frame} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      selected={selected}
      style={frame}
      accessibilityLabel={`${pointText(point.name)} · ${meta} · ${formatPrice(option.priceCents, locale)}`}
      testID={testID}
    >
      {body}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.space['2xs'],
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
  },
  selected: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  idle: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors['sand-400'],
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  dot: {
    width: theme.space.lg,
    height: theme.space.lg,
    borderRadius: theme.space.lg / 2,
  },
  meta: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  price: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  name: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  place: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  hours: {
    marginTop: theme.space.xs,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },
}));
