import { carrierToneOf, formatPrice, shippingChoiceView, shippingNotice, type ServicePointEntry } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/checkout';
import type { CheckoutSnapshot } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { OptionRow } from '@/screens/customer-kit/option-row';
import { ServicePointCard } from './service-point-card';

interface ModeCardProps {
  icon: 'business' | 'home';
  title: string;
  from: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}

/** Teslim türü kartı: tür ve en düşük fiyatı; seçili kart seçenek satırıyla aynı çerçeveyi taşır. */
function ModeCard({ icon, title, from, selected, onPress, testID }: ModeCardProps) {
  const { theme } = useUnistyles();
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      selected={selected}
      grow
      style={[styles.mode, selected ? styles.modeOn : styles.modeOff]}
      accessibilityLabel={`${title} · ${from}`}
      testID={testID}
    >
      <View style={[styles.modeIcon, selected ? styles.modeIconOn : styles.modeIconOff]}>
        <Icon name={icon} size={theme.size.rowIcon} color={selected ? theme.colors['on-image'] : theme.colors.olive} />
      </View>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeFrom}>{from}</Text>
    </PressableSurface>
  );
}

interface ShippingChoiceProps {
  locale: Locale;
  shipping: CheckoutSnapshot['shipping'];
  /** Müşterinin seçtiği tür; iki tür de sunulurken çizilen tür budur (`shippingChoiceView`). */
  mode: 'home' | 'point';
  /** Sunucunun seçtiği servis: işaretli satır ve ücretin kaynağı. */
  selectedCode: string | null;
  point: ServicePointEntry | null;
  onSelectShipping: (code: string) => void;
  onSelectMode: (mode: 'home' | 'point') => void;
  onOpenPicker: () => void;
}

/**
 * Kargo seçimi: önce teslim türü, altında eve teslim servisleri ya da seçilen nokta; web telefon görünümüyle aynı düzen ve metin. Seçim
 * sunucuya gider ve ücret yeniden çözülür, ekran fiyat hesaplamaz.
 */
export function ShippingChoice({
  locale,
  shipping,
  mode,
  selectedCode,
  point,
  onSelectShipping,
  onSelectMode,
  onOpenPicker,
}: ShippingChoiceProps) {
  const t = messages[locale];
  const { theme } = useUnistyles();
  if (shipping?.mode === 'auto') return <Text style={styles.note}>{t.carrier.freeHome}</Text>;

  const view = shippingChoiceView(shipping?.options ?? [], mode);
  if (shipping === null || (view.home.length === 0 && view.point.length === 0)) {
    return <Text style={styles.note}>{shippingNotice(shipping, t.carrier)}</Text>;
  }

  return (
    <View style={styles.block} testID="checkout-shipping-choice">
      <Text style={styles.heading}>
        {t.carrier.title}
        {shipping.parcelCount > 1 ? ` · ${t.carrier.parcels.replace('{count}', String(shipping.parcelCount))}` : ''}
      </Text>
      {view.hasModes ? (
        <>
          <View style={styles.modes}>
            <ModeCard
              icon="business"
              title={t.carrier.point}
              from={t.carrier.from.replace('{price}', formatPrice(view.pointFromCents!, locale))}
              selected={view.mode === 'point'}
              onPress={() => onSelectMode('point')}
              testID="checkout-shipping-mode-point"
            />
            <ModeCard
              icon="home"
              title={t.carrier.home}
              from={t.carrier.from.replace('{price}', formatPrice(view.homeFromCents!, locale))}
              selected={view.mode === 'home'}
              onPress={() => onSelectMode('home')}
              testID="checkout-shipping-mode-home"
            />
          </View>
          <View style={styles.divider} />
          <Text style={styles.heading}>{view.mode === 'home' ? t.carrier.pickHome : t.carrier.pickPoint}</Text>
        </>
      ) : null}
      {view.mode === 'home'
        ? view.home.map((option, index) => {
            const details = [
              option.leadTimeHours ? t.carrier.days.replace('{hours}', String(option.leadTimeHours)) : null,
              option.tracked ? t.carrier.tracked : null,
            ].filter((part): part is string => part !== null);
            return (
              <OptionRow
                key={option.code}
                label={option.carrierName}
                badge={view.home.length === 2 ? (index === 0 ? t.carrier.cheapest : t.carrier.fastest) : undefined}
                description={details.length > 0 ? details.join(' · ') : undefined}
                selected={selectedCode === option.code}
                onPress={() => onSelectShipping(option.code)}
                trailing={<Text style={styles.price}>{formatPrice(option.priceCents, locale)}</Text>}
                testID={`checkout-shipping-${option.code}`}
              />
            );
          })
        : null}
      {view.mode === 'point' ? (
        point ? (
          <>
            <ServicePointCard
              entry={point}
              locale={locale}
              tone={carrierToneOf(view.point)(point.point.carrierCode)}
              selected
              onPress={onOpenPicker}
              testID="checkout-shipping-point"
            />
            <TextAction label={t.point.change} onPress={onOpenPicker} align="start" testID="checkout-shipping-point-change" />
          </>
        ) : (
          <OptionRow
            label={t.point.choose}
            description={t.point.mapHint}
            selected={false}
            onPress={onOpenPicker}
            trailing={<Icon name="pin" size={theme.size.headerIcon} />}
            testID="checkout-shipping-point-choose"
          />
        )
      ) : null}
      <Text style={styles.hint}>{t.carrier.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    gap: theme.space.lg,
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  heading: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  modes: {
    flexDirection: 'row',
    gap: theme.space.lg,
  },
  mode: {
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.control,
    borderWidth: theme.border.base,
  },
  modeOn: {
    backgroundColor: theme.colors['sand-150'],
    borderColor: theme.colors.ink,
  },
  modeOff: {
    backgroundColor: theme.colors['sand-250'],
    borderColor: theme.colors['sand-400'],
  },
  modeIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.size.avatarMd,
    height: theme.size.avatarMd,
    borderRadius: theme.size.avatarMd / 2,
  },
  modeIconOn: { backgroundColor: theme.colors.olive },
  modeIconOff: { backgroundColor: theme.colors.card },
  modeTitle: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  modeFrom: {
    textAlign: 'center',
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  divider: {
    height: theme.border.hairline,
    marginTop: theme.space.sm,
    marginBottom: theme.space['2xs'],
    backgroundColor: theme.colors['sand-400'],
  },
  price: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  hint: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
