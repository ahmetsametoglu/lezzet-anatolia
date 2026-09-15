import { useRouter } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { joinCountries } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Note } from '@/components/ui/note';
import { SectionHeader } from '@/components/ui/section-header';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';
import { PostalCodeSheet } from '@/screens/customer-kit/postal-code-sheet';
import { useDeliveryTerms } from '@/screens/customer-kit/use-delivery-terms.hook';
import { useSheet } from '@/screens/customer-kit/use-sheet.hook';
import messages from './messages.json';
import { useDeliveryZones } from './use-delivery-zones.hook';

/*
  Teslimat bölgeleri, "nereye gidiyorsunuz?" sorusunun cevabı: liste posta kodudur, çünkü müşterinin elindeki tek anahtar kendi
  kodudur ve bölge adı operasyonun rota etiketidir. Satır başına tek yer (`Strasbourg (67000 · 67100)`), ülke öbekleri altında, çünkü
  yüzlerce kod düz listede okunmaz; kendi kodunu denemek vitrin başlığındaki aynı posta kodu çekmecesiyle yapılır.
*/

type Messages = LocalizedCopy<typeof messages>;

export function DeliveryZonesScreen() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const zones = useDeliveryZones();

  const zipSheet = useSheet();
  /* Çekmecenin başlangıç değeri cihazda SAKLI koddur — sayfa kendi başına bir kod tutmaz. */
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);

  /* KAPANIŞ CÜMLESİNİN ÜLKELERİ: okuma bitmediyse ya da düştüyse ülkesiz hâl yazılır — boş bir
     parantez ya da "undefined" basmaktansa cümleyi bir tık genel kurmak doğrusu. Küme BOŞ dönerse
     (hiç kargo deposu yok) yine ülkesiz hâl: "hiçbir yere" diye yazmayız, susarız. */
  const terms = useDeliveryTerms();
  const shippingCountries = terms.status === 'ready' ? terms.terms.shippingCountries : [];
  const closing =
    shippingCountries.length === 0
      ? t.closingNoShipping
      : t.closing.replace('{countries}', joinCountries(shippingCountries, t.countries, t.and));

  const list =
    zones.status === 'loading' ? (
      /* Halka yerine listenin iskeleti bekler, çünkü beklenen şey bir işlem değil bir yerleşim ve halka onu tutmadığı için liste
         gelince sayfa bir anda uzardı. */
      <View
        style={styles.groups}
        testID="zones-loading"
        accessible
        accessibilityRole="progressbar"
        /* Ekran okuyucuya TEK ses: rol + ad + meşgul. Ad korundu çünkü halkanın yerini alan bu
           blok, ekranda yazılı hiçbir şey taşımıyor — "ilerleme çubuğu" tek başına neyin
           beklendiğini söylemezdi. */
        accessibilityLabel={t.loading}
        accessibilityState={{ busy: true }}
      >
        {[0, 1].map((group) => (
          <View key={group} style={styles.group}>
            <Skeleton width="38%" height={theme.text.h2 * theme.text['h1--line-height']} tone="deep" />
            {[0, 1, 2, 3].map((row) => (
              <Skeleton
                key={row}
                width={row % 2 === 0 ? '86%' : '72%'}
                height={theme.text.body * theme.text['lead--line-height']}
              />
            ))}
          </View>
        ))}
      </View>
    ) : zones.status === 'error' ? (
      <View style={styles.errorBlock}>
        <Note tone="error" description={t.errorBody} testID="zones-error" />
        <TextAction label={t.retry} onPress={zones.retry} testID="zones-retry" />
      </View>
    ) : zones.areas.length === 0 ? (
      /* `fill={false}`: kaydırma kabının içinde bir gövde parçası — üstünde başlık, altında açıklama
         blokları var; ortalama onları aşağı iterdi. */
      <EmptyState
        fill={false}
        icon={<CustomerIcon name="truck" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
        title={t.empty.title}
        description={t.empty.body}
        testID="zones-empty"
      />
    ) : (
      <View style={styles.groups} testID="zones-list">
        {zones.areas.map((area) => (
          <View key={area.country} style={styles.group}>
            {/* Ülke adı EKRANIN sözlüğünden: sunucu ülke KODU gönderiyor (`FR`) — cümleyi kuran
                taraf her zaman ekran (uç biçimli metin göndermez, katalog kartının kuralı). */}
            <Text style={styles.country}>{t.countries[area.country]}</Text>
            {area.places.map((place, index) => (
              /* Anahtar ad ve sıraya bağlı: adsız öbek `null` taşır ve iki ülke aynı yer adını taşıyabilir, çıplak ad o gün çakışırdı. */
              <Text key={`${place.name ?? ''}-${index}`} style={styles.placeLine} testID={`zones-place-${index}`}>
                {/* Adı olmayan öbek YALNIZ kodlarıyla çizilir (sözleşmenin `name: null` hâli):
                    yer kaydı yok diye kodu gizlemek, gittiğimiz bir yeri saklamak olurdu. */}
                {place.name === null ? place.codes.join(' · ') : `${place.name} (${place.codes.join(' · ')})`}
              </Text>
            ))}
          </View>
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
      <ScrollView contentContainerStyle={styles.content} testID="zones-scroll">
        <Text style={styles.intro}>{t.intro}</Text>
        <SectionHeader eyebrow={t.listEyebrow} testID="zones-section" />
        {list}
        {/* Kod denemesi listenin ALTINDA: önce "nerelere gidiyoruz" cevaplanır, sonra "peki ben
            neredeyim" sorulur. Üstte dursaydı sayfa, cevabını verdiği soruyu geri sorardı. */}
        <TextAction
          label={t.tryCode}
          onPress={zipSheet.open}
          accessibilityHint={t.tryCodeHint}
          testID="zones-try-code"
        />
        {/* Kapanış cümlesi kargo yolunu açıkça söyler ki liste "burada yoksanız satmıyoruz" diye okunmasın; ülkeler kargo depolarından
            türer, okuma düşerse cümle ülkesiz hâliyle ayakta kalır. */}
        <Note tone="warm" description={closing} testID="zones-closing" />
      </ScrollView>

      {/* Çekmece İLK AÇILIŞTA kurulur (bandın aynı kararı) — gerekçe `use-sheet.hook`ta. */}
      {zipSheet.mounted ? (
        <PostalCodeSheet
          visible={zipSheet.visible}
          code={onboarding?.postalCode ?? null}
          onClose={zipSheet.close}
          // Bağlantı ÇİZİLMEZ: müşteri zaten o sayfada — kendine götüren bir kapı ölü kapıdır.
          showZonesLink={false}
          testID="zones-zip"
        />
      ) : null}
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
    color: theme.colors.muted,
  },
  /** Saran rozet ızgarası — kodlar aynı boyda, göz bir bakışta tarar. */
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: theme.space.lg,
    rowGap: theme.space.lg,
  },
  /** Ülke öbekleri — aralarındaki nefes, satır aralığından BÜYÜK: hiyerarşi boşlukla okunur. */
  groups: { gap: theme.space['4xl'] },
  group: { gap: theme.space.md },
  country: {
    fontFamily: theme.font.display[theme.text['h2--font-weight']],
    fontSize: theme.text.h2,
    color: theme.colors.ink,
    marginBottom: theme.space['2xs'],
  },
  /** Tek satır: "Strasbourg (67000 · 67100 · 67200)". Sarabilir; sarınca da tek blok kalır. */
  placeLine: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.body,
    lineHeight: theme.text.body * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  errorBlock: {
    gap: theme.space.lg,
    alignItems: 'flex-start',
  },
}));
