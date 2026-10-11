import { useRouter } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { joinCountries } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import messages from '@lezzet/i18n/customer/delivery-zones';
import type { Country, DeliveryAreaList } from '@lezzet/types';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Note } from '@/components/ui/note';
import { SectionHeader } from '@/components/ui/section-header';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PostalCodeFields } from '@/screens/customer-kit/postal-code-fields';
import { usePostalCodeDraft } from '@/screens/customer-kit/use-postal-code-draft.hook';
import { useDeliveryTerms } from '@/screens/customer-kit/use-delivery-terms.hook';
import { useDeliveryZones } from './use-delivery-zones.hook';

/*
  Teslimat bölgeleri, "nereye gidiyorsunuz?" sorusunun cevabı: önce müşterinin kendi kodu sorulur, çünkü asıl soru "benim kodum var mı"
  ve cevabı listenin altında kalmamalı. Yerler ülke kartlarında kapalı gelir ki liste büyüdükçe sayfa uzamasın.
*/

type Messages = LocalizedCopy<typeof messages>;
type Area = DeliveryAreaList['areas'][number];

export function DeliveryZonesScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const zones = useDeliveryZones();
  /* Kod kartı cihazda saklı kodla açılır, ki müşteri kendi cevabını yazmadan görsün; sayfa kodu kaydetmez, yalnız sorar. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const form = usePostalCodeDraft(onboarding?.postalCode ?? null, onboarding?.country ?? null, true);
  const [open, setOpen] = useState<Partial<Record<Country, boolean>>>({});

  /* Okuma bitmediyse, düştüyse ya da hiç kargo deposu yoksa cümle ülkesiz kurulur; boş parantez ya da "hiçbir yere" yazılmaz. */
  const terms = useDeliveryTerms();
  const shippingCountries = terms.status === 'ready' ? terms.terms.shippingCountries : [];
  const closing =
    shippingCountries.length === 0
      ? t.closingNoShipping
      : t.closing.replace('{countries}', joinCountries(shippingCountries, t.countries, t.and));

  const countOf = (n: number) => (n === 1 ? t.placeCountOne : t.placeCount.replace('{n}', String(n)));

  const list =
    zones.status === 'loading' ? (
      /* Halka yerine kartların iskeleti bekler: beklenen bir yerleşim ve halka onu tutmadığı için liste gelince sayfa bir anda uzardı. */
      <View
        style={styles.groups}
        testID="zones-loading"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t.loading}
        accessibilityState={{ busy: true }}
      >
        {[0, 1].map((group) => (
          <Skeleton key={group} width="100%" height={theme.text['card-title-sm'] + theme.space['2xl'] * 2} radius="card" tone="deep" />
        ))}
      </View>
    ) : zones.status === 'error' ? (
      <View style={styles.errorBlock}>
        <Note tone="error" description={t.errorBody} testID="zones-error" />
        <TextAction label={t.retry} onPress={zones.retry} testID="zones-retry" />
      </View>
    ) : zones.areas.length === 0 ? (
      /* `fill={false}`: kaydırma kabının içinde bir gövde parçası; ortalama üstündeki ve altındaki blokları iterdi. */
      <EmptyState
        fill={false}
        icon={<Icon name="truck" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
        title={t.empty.title}
        description={t.empty.body}
        testID="zones-empty"
      />
    ) : (
      <View style={styles.groups} testID="zones-list">
        <View style={styles.summary}>
          <View style={styles.summaryEyebrow}>
            <SectionHeader eyebrow={t.listEyebrow} testID="zones-section" />
          </View>
          <Text style={styles.count}>{countOf(zones.areas.reduce((sum, area) => sum + area.places.length, 0))}</Text>
        </View>
        {zones.areas.map((area) => (
          <AreaCard
            key={area.country}
            area={area}
            name={t.countries[area.country]}
            count={countOf(area.places.length)}
            open={open[area.country] === true}
            onToggle={() => setOpen((current) => ({ ...current, [area.country]: !current[area.country] }))}
          />
        ))}
      </View>
    );

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="zones-back" />}
        testID="zones-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="zones-scroll">
        <Text style={styles.intro}>{t.intro}</Text>
        <View style={styles.codeCard}>
          <Text style={styles.codeTitle}>{t.codeTitle}</Text>
          <PostalCodeFields form={form} testID="zones-code" />
        </View>
        {list}
        {/* Kapanış cümlesi kargo yolunu açıkça söyler ki liste "burada yoksanız satmıyoruz" diye okunmasın. */}
        <Note tone="warm" description={closing} testID="zones-closing" />
      </ScrollView>
    </View>
  );
}

interface AreaCardProps {
  area: Area;
  /** Ülke adı ekranın sözlüğünden; sunucu yalnız ülke kodu gönderir. */
  name: string;
  count: string;
  open: boolean;
  onToggle: () => void;
}

/** Ülke kartı: başlıkta yer sayısı, açılınca yerler iki sütunda; satırlar eşit hizalı ki göz satırı izleyebilsin. */
function AreaCard({ area, name, count, open, onToggle }: AreaCardProps) {
  const rows: Area['places'][] = [];
  for (let i = 0; i < area.places.length; i += 2) rows.push(area.places.slice(i, i + 2));

  return (
    <View style={styles.card}>
      <PressableSurface
        onPress={onToggle}
        feedback="opacity"
        style={styles.cardHead}
        accessibilityLabel={`${name}, ${count}`}
        testID={`zones-area-${area.country}`}
      >
        <Text style={styles.cardName}>{name}</Text>
        <Text style={styles.cardCount}>{count}</Text>
        <Text style={styles.cardSign}>{open ? '–' : '+'}</Text>
      </PressableSurface>
      {!open ? null : (
        <View style={styles.cardBody}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.row, rowIndex < rows.length - 1 && styles.rowRule]}>
              {row.map((place, index) => (
                /* Adı olmayan yer yalnız kodlarıyla çizilir: yer kaydı yok diye kodu gizlemek gittiğimiz bir yeri saklamak olurdu. */
                <View key={`${place.name ?? ''}-${index}`} style={styles.cell} testID={`zones-place-${area.country}-${rowIndex * 2 + index}`}>
                  {place.name === null ? null : <Text style={styles.placeName}>{place.name}</Text>}
                  <Text style={styles.placeCodes}>{place.codes.join(' · ')}</Text>
                </View>
              ))}
              {row.length === 1 ? <View style={styles.cell} /> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    paddingHorizontal: theme.space['6xl'],
    paddingTop: theme.space['4xl'],
    paddingBottom: theme.space['9xl'],
    gap: theme.space['3xl'],
  },
  intro: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.ink,
  },
  codeCard: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.lg,
  },
  codeTitle: {
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  groups: { gap: theme.space.lg },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  summaryEyebrow: { flex: 1 },
  count: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  card: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space['3xl'],
    paddingVertical: theme.space['2xl'],
  },
  cardName: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['card-title-sm--font-weight']],
    fontSize: theme.text['card-title-sm'],
    color: theme.colors.ink,
  },
  cardCount: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  cardSign: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.body,
    color: theme.colors.ink,
    minWidth: theme.space.xl,
    textAlign: 'center',
  },
  /** Kesik ayraçta renk `borderColor`a verilir: iOS tek kenara özgü renkte kesik kenarı çizmiyor. */
  cardBody: {
    borderTopWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingHorizontal: theme.space['3xl'],
  },
  row: {
    flexDirection: 'row',
    gap: theme.space['2xl'],
    paddingVertical: theme.space.md,
  },
  rowRule: {
    borderBottomWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  cell: { flex: 1, gap: theme.space['2xs'] },
  placeName: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  placeCodes: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.ink,
  },
  errorBlock: {
    gap: theme.space.lg,
    alignItems: 'flex-start',
  },
}));
