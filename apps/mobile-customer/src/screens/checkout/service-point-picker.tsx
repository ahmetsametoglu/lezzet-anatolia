import type { ServicePointEntry } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/checkout';
import type { CheckoutShippingOption } from '@lezzet/types';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { carrierToneStyles } from './carrier-tone';
import { ServicePointCard } from './service-point-card';
import type * as ServicePointMapModule from './service-point-map';
import { useServicePoints } from './use-service-points.hook';

/**
 * Harita yerel modülü seçici açılınca yüklenir: kütüphane yüklenirken yerel modülü zorunlu ister ve modülü taşımayan bir derlemede
 * statik içe aktarma ödeme ekranını açılırken düşürürdü. Modül yoksa `null` döner ve seçici haritasız, listeyle çalışır.
 */
function loadServicePointMap(): typeof ServicePointMapModule.ServicePointMap | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./service-point-map') as typeof ServicePointMapModule).ServicePointMap;
  } catch {
    return null; // yerel modül bu derlemede yok: liste ve seçim çalışmaya devam eder
  }
}

interface ServicePointPickerProps {
  locale: Locale;
  addressId: string;
  /** Noktaya giden servisler; her nokta türünü kabul edenin fiyatıyla görünür. */
  pointOptions: readonly CheckoutShippingOption[];
  selectedId: string | null;
  onSelect: (entry: ServicePointEntry) => void;
  onClose: () => void;
}

/**
 * Nokta seçici: harita tam ekran, dokunulan noktanın kartı altta, liste mevcut çekmecede ve en ucuz başta; seçim üstteki düğmeyle
 * yapılır. Web telefon görünümünün seçicisiyle aynı düzen, ödeme ekranının üstüne katman olarak çizilir ki çekmece onun üstünde açılsın.
 */
export function ServicePointPicker({ locale, addressId, pointOptions, selectedId, onSelect, onClose }: ServicePointPickerProps) {
  const t = messages[locale];
  const { theme, rt } = useUnistyles();
  const { load, entries, carriers, toneOf } = useServicePoints(locale, addressId, pointOptions);
  const [pendingId, setPendingId] = useState<string | null>(selectedId);
  const [listOpen, setListOpen] = useState(false);
  const [ServicePointMap] = useState(loadServicePointMap);
  const pending = entries.find((entry) => entry.point.id === pendingId) ?? null;
  const carrierNames = (codes: string[]) =>
    codes.map((code) => carriers.find((c) => c.carrierCode === code)?.carrierName ?? code).join(', ');
  const pins = useMemo(
    () =>
      entries.flatMap(({ point, option }) =>
        point.latitude === null || point.longitude === null
          ? []
          : [
              {
                id: point.id,
                lat: point.latitude,
                lng: point.longitude,
                tone: toneOf(point.carrierCode),
                title: `${point.name} · ${option.carrierName}`,
              },
            ],
      ),
    [entries, toneOf],
  );

  // Donanım geri tuşu seçiciyi kapatır; ödeme ekranından çıkmak o anda müşterinin niyeti değil.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  return (
    <View style={styles.screen} testID="service-point-picker">
      <AppBar
        title={t.carrier.point}
        left={
          <PressableSurface
            onPress={onClose}
            feedback="tint"
            compact
            style={styles.close}
            accessibilityLabel={t.point.close}
            testID="service-point-close"
          >
            <Icon name="close" size={theme.size.headerIcon} />
          </PressableSurface>
        }
        right={
          <PressableSurface
            onPress={() => {
              if (!pending) return;
              onSelect(pending);
              onClose();
            }}
            feedback="scale"
            disabled={!pending}
            style={[styles.select, pending ? styles.selectOn : styles.selectOff]}
            accessibilityLabel={t.point.select}
            testID="service-point-select"
          >
            <Text style={[styles.selectLabel, pending ? styles.selectLabelOn : styles.selectLabelOff]}>{t.point.select}</Text>
          </PressableSurface>
        }
        testID="service-point-appbar"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legend} contentContainerStyle={styles.legendRow}>
        {carriers.map((carrier) => (
          <View key={carrier.carrierCode} style={styles.legendItem}>
            <View style={[styles.legendDot, carrierToneStyles[toneOf(carrier.carrierCode)]]} />
            <Text style={styles.legendLabel}>{carrier.carrierName}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.mapArea}>
        {ServicePointMap === null ? (
          <View style={styles.mapFallback} />
        ) : (
          <ServicePointMap
            pins={pins}
            selectedId={pendingId}
            home={load.phase === 'ready' && load.origin ? { ...load.origin, label: t.point.yourAddress } : null}
            bottomInset={rt.insets.bottom}
            onPick={setPendingId}
          />
        )}
        {/* Alttaki yığın Google logosunun ve telif satırının üstünde durur: şart gereği haritanın alt köşeleri örtülmez. */}
        <View style={styles.floating} pointerEvents="box-none">
          {load.phase === 'ready' && load.failedCarriers.length > 0 ? (
            <View style={[styles.chip, styles.chipCard]}>
              <Text style={styles.failed}>{t.point.failed.replace('{carriers}', carrierNames(load.failedCarriers))}</Text>
            </View>
          ) : null}
          {pending ? (
            <View style={styles.pendingCard}>
              <ServicePointCard
                entry={pending}
                locale={locale}
                tone={toneOf(pending.point.carrierCode)}
                selected
                showHours
                testID="service-point-pending"
              />
            </View>
          ) : null}
          {load.phase === 'loading' ? (
            <View style={[styles.chip, styles.chipPill]}>
              <Text style={styles.status}>{t.point.loading}</Text>
            </View>
          ) : null}
          {load.phase === 'failed' || (load.phase === 'ready' && entries.length === 0) ? (
            <View style={[styles.chip, styles.chipCard]}>
              <Text style={styles.status}>{t.point.empty}</Text>
            </View>
          ) : null}
          {entries.length > 0 ? (
            <PressableSurface onPress={() => setListOpen(true)} feedback="scale" style={styles.listPill} testID="service-point-list-open">
              <Text style={styles.listPillLabel}>{t.point.showList.replace('{count}', String(entries.length))}</Text>
            </PressableSurface>
          ) : null}
        </View>
      </View>
      <BottomSheet visible={listOpen} title={t.point.listTitle} onClose={() => setListOpen(false)} testID="service-point-list">
        <View style={styles.list}>
          {entries.map((entry) => (
            <ServicePointCard
              key={entry.point.id}
              entry={entry}
              locale={locale}
              tone={toneOf(entry.point.carrierCode)}
              selected={entry.point.id === pendingId}
              onPress={() => {
                setPendingId(entry.point.id);
                setListOpen(false);
              }}
              testID={`service-point-row-${entry.point.id}`}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors['sand-50'],
  },
  close: {
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.size.iconButton,
    height: theme.size.iconButton,
    borderRadius: theme.size.iconButton / 2,
  },
  select: {
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.xl,
  },
  selectOn: { backgroundColor: theme.colors.olive },
  selectOff: { backgroundColor: theme.colors['disabled-fill'] },
  selectLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
  },
  selectLabelOn: { color: theme.colors['on-image'] },
  selectLabelOff: { color: theme.colors['disabled-text'] },
  legend: {
    flexGrow: 0,
    borderBottomWidth: theme.border.hairline,
    borderBottomColor: theme.colors['sand-275'],
  },
  legendRow: {
    gap: theme.space.xl,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['3xl'],
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  legendDot: {
    width: theme.space.lg,
    height: theme.space.lg,
    borderRadius: theme.space.lg / 2,
  },
  legendLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.ink,
  },
  mapArea: {
    flex: 1,
  },
  mapFallback: {
    flex: 1,
    backgroundColor: theme.colors['sand-100'],
  },
  floating: {
    position: 'absolute',
    left: theme.space.xl,
    right: theme.space.xl,
    // Google logosunun yüksekliği ve payı kadar yukarıda; web seçicisinin alt yığınıyla aynı mesafe.
    bottom: rt.insets.bottom + theme.space['8xl'] + theme.space.lg,
    alignItems: 'center',
    gap: theme.space.lg,
  },
  pendingCard: {
    alignSelf: 'stretch',
    borderRadius: theme.radius.control,
    boxShadow: theme.shadow.badge,
  },
  chip: {
    backgroundColor: theme.colors.card,
    paddingVertical: theme.space.md,
    boxShadow: theme.shadow.badge,
  },
  chipCard: {
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space.xl,
  },
  chipPill: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space['3xl'],
  },
  failed: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.honey,
  },
  status: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  listPill: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.ink,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['5xl'],
    boxShadow: theme.shadow.soft,
  },
  listPillLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors['on-image'],
  },
  list: {
    gap: theme.space.md,
  },
}));
