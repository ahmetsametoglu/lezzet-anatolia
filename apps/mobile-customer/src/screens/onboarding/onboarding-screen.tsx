import { brand } from '@lezzet/brand';
import { formatCompactEuro } from '@lezzet/helper';
import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import type { MePointsEarnWayKey } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { setAppLocale, useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { saveOnboarding } from '@/lib/onboarding/onboarding-store';
import placeMessages from '@lezzet/i18n/customer/place';
import { maskPostalCode, usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { applyFontScale, FONT_SCALES, saveFontScale, type FontScale } from '@lezzet/mobile-kit/src/lib/settings/font-scale';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { PointsEarnList } from '@/screens/customer-kit/points-earn-list';
import { usePointsRules } from '@/screens/customer-kit/use-points-rules.hook';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { StepDots } from './step-dots';
import messages from './messages.json';

/*
  İlk açılışın adımları: dil, yazı boyutu, teslimat, posta kodu, ödeme ve puan kartları; her çıkış seçimleri cihaza yazar,
  kapı kök layout'tadır (`use-onboarding-gate.hook.ts`). Dil seçimi uygulamanın dilini anında değiştirir ve misafirin cevabı
  olarak cihazda kalır; hesap açılınca OTP çağrısıyla profile tohumlanır, ikinci bir yol tohumla yarışacağı için bu ekran
  profile yazmaz.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Puandan önceki adımlar: dil · yazı boyutu · teslimat · posta kodu · ödeme. */
const BASE_STEP_COUNT = 5;

/** Puan bölümünün giriş kartı: oranı ve en güçlü sayıyı söyler, dökümü değil. */
const POINTS_INTRO_STEP = BASE_STEP_COUNT;

/**
 * Puan kartları liste değil grup grup: müşteri kendini "ne yaparak" sorusuyla bir gruba yerleştirir, en çok kazandıran grup
 * önce gelir. Anahtarlar sözleşmeden (`MePointsEarnWayKey`); burada yazılmayan yol hiçbir kartta çıkmaz.
 */
const POINTS_GROUPS = [
  { key: 'invite', ways: ['referral', 'neighbor'] },
  { key: 'review', ways: ['review', 'feedback_purchase'] },
  { key: 'visit', ways: ['visit', 'feedback_candidate'] },
] as const satisfies readonly { key: string; ways: readonly MePointsEarnWayKey[] }[];

/** Dil seçildikten sonra sonraki adıma kendiliğinden geçmeden önceki bekleme. */
const LANGUAGE_ADVANCE_MS = 250;

/** Logo görselinin kaynak oranı (1244×602). */
const LOGO_ASPECT = 1244 / 602;

/** Posta kodu girdisinin yüksekliği; tasarımın bu büyük ve kalın girdisi kitin `TextField`ında yok. */
const ZIP_FIELD_HEIGHT = 56;

/** Teslimat ve ödeme satırlarındaki ikonların kenarı. */
const PAYMENT_ICON_SIZE = 21;

/** Not alanının sabit yüksekliği: cevap gelince ekran zıplamasın diye alan hep ayrılır, iki satırlık en uzun cümleye göre. */
const ZIP_NOTE_HEIGHT = 64;

export function OnboardingScreen() {
  /* Seçili dil ayrı durumda tutulmaz: uygulamanın dili seçimin kendisidir. */
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  const [zip, setZip] = useState('');
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Kural ekran açılınca istenir, müşteri puan adımına gelene kadar cevap gelmiş olur. Kimliksiz uç, misafirde de çalışır. */
  const pointsRules = usePointsRules();

  /* Davet ödülünün para karşılığı listeden türer; yol listede yoksa cümle hiç kurulmaz. */
  const referralWay = pointsRules.status === 'ready' ? pointsRules.rules.earnWays.find((w) => w.key === 'referral') : undefined;
  const referralValueCents =
    pointsRules.status === 'ready' && referralWay !== undefined ? referralWay.points * pointsRules.rules.centValue : null;

  /* Boş kalan grubun kartı açılmaz ve adım sayısına girmez: var olmayan kartı saymak tamamlanamayacak bir ilerleme gösterirdi. */
  const pointsGroups =
    pointsRules.status === 'ready'
      ? POINTS_GROUPS.map((group) => ({
          key: group.key,
          ways: pointsRules.rules.earnWays.filter((way) => (group.ways as readonly string[]).includes(way.key)),
        })).filter((group) => group.ways.length > 0)
      : [];

  const stepCount = POINTS_INTRO_STEP + 1 + pointsGroups.length;
  /** Grup kartındaysak kaçıncı grup; giriş kartında ve öncesinde negatif. */
  const groupIndex = step - POINTS_INTRO_STEP - 1;
  const isLastStep = step === stepCount - 1;
  /** Alt bölmedeki "Sonra bakarım" yalnız puan bölümünde durur. */
  const inPointsSection = step >= POINTS_INTRO_STEP;

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const pickLanguage = (next: Locale) => {
    // Anında uygulanır ve cihaza yazılır; bu ekranın metni de aynı karede döner.
    void setAppLocale(next);
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      // Yalnız ilk adımdan ilerletir: gecikme sırasında "Devam"la ilerleyen kullanıcı geri sarılmaz.
      setStep((current) => (current === 0 ? 1 : current));
    }, LANGUAGE_ADVANCE_MS);
  };

  /* Seçim anında uygulanır ki kullanıcı örnek metinle kıyaslasın; kalıcı yazım çıkışta (`leave`). */
  const pickScale = (next: FontScale) => {
    setFontScale(next);
    applyFontScale(next);
  };

  // Maske ve çözüm vitrinin teslimat çekmecesiyle ortak kapıdan (`lib/places`).
  const onZipChange = (value: string) => setZip(maskPostalCode(value));

  /* Bekleyiş bayrağı hook'tan gelir, türetilmez: `place === null` düşen isteği de kapsar ve türetilmiş bayrak orada
     sönmediği için iskelet hep dönerdi. */
  const { place, pending: zipPending } = usePlaceLookup(zip);

  /* Dört hâlin her biri kendi cümlesini alır; bilinmeyen kod kapı değil uyarıdır. */
  const zipInside = place?.kind === 'resolved' && place.place.inRoute;
  const placeName = place?.kind === 'resolved' ? place.place.placeName : null;
  const zipCopy = placeMessages[locale].zip;
  const zipNote =
    place === null
      ? null
      : place.kind === 'resolved'
        ? place.place.inRoute
          ? zipCopy.insideNote
          : zipCopy.shippingNote
        : place.kind === 'ambiguous'
          ? zipCopy.ambiguousNote
          : place.kind === 'unknown'
            ? zipCopy.unknownNote
            : zipCopy.unresolvedNote;

  /**
   * Her çıkış o ana dek yapılan seçimleri saklar ve onboarding'i bitmiş sayar. Son adımın iki çıkışı var: "Hesap aç" girişe,
   * "Sonra bakarım" vitrine.
   */
  const leave = (target: '/' | '/login') => {
    void saveOnboarding({ done: true, locale, postalCode: zip === '' ? null : zip });
    void saveFontScale(fontScale);
    router.replace(target);
  };

  /** Son adımdan çıkış: karşılama toast'ı yalnız burada, başlıktaki "Atla" sessiz çıkar. */
  const finish = (target: '/' | '/login') => {
    leave(target);
    toastSuccess(t.doneToast);
  };

  const next = () => {
    if (!isLastStep) setStep(step + 1);
    // Son kart hesap açmayı önerir: puanı anlatmadan hesap istemek, sebebini söylemeden kimlik sormak olurdu.
    else finish('/login');
  };

  /* İki teslimat yolu sistemin kuralıdır: rota içi kendi soğutuculu aracımız, dışı kargo; kargo soğuk zincir taşımaz. */
  const deliveryRows = [
    {
      key: 'route',
      icon: <CustomerIcon name="truck" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.delivery.route,
    },
    {
      key: 'shipping',
      // Koli ikonu: iki satırın ayrımı "araç ↔ koli" olarak okunur, bina silueti kargoyu anlatmaz.
      icon: <CustomerIcon name="box" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.delivery.shipping,
    },
  ] as const;

  const paymentRows = [
    {
      key: 'online',
      icon: <CustomerIcon name="card" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.payment.online,
    },
    {
      key: 'door',
      icon: <Icon name="home" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.payment.door,
    },
    /* Havale `money` ikonuyla: bir üstteki kapıda ödeme `home` taşıyor ve iki bina silueti bir bakışta ayrışmaz. */
    {
      key: 'transfer',
      icon: <Icon name="money" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.payment.transfer,
    },
  ] as const;

  return (
    /* Boşluğa dokununca klavye kapanır: RN'de bu platformdan gelmez, iOS'un rakam klavyesinde Done tuşu yok ve "Devam"
       klavyenin altında kalır. Katman şeffaf ve ekran okuyucuya kapalı; içteki düğmeler kendi dokunuşlarını alır. */
    <Pressable style={styles.screen} onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.header}>
        <Image
          // Statik varlık Metro'da `require` ile yüklenir; kural TS içe aktarma disiplinine bakar, varlık yolunu bilmez.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('@lezzet/mobile-kit/assets/images/logo.png')}
          style={styles.logo}
          accessibilityLabel={brand.name}
        />
        <PressableSurface onPress={() => leave('/')} feedback="opacity" compact accessibilityLabel={t.skip} testID="onboarding-skip">
          <Text style={styles.skip}>{t.skip}</Text>
        </PressableSurface>
      </View>

      {/* Kaydırıcı kitin `FormScroll`u, çünkü ekranda metin alanı var: klavye kaçınmasını ve ilk dokunuşun yutulmamasını
          birlikte taşır. `flexGrow` kısa içeriği ortada tutar, uzun içerik kaydırılır. */}
      <FormScroll contentContainerStyle={[styles.content, styles.contentCenter, styles.contentGrow]} testID="onboarding-scroll">
        {step === 0 ? (
          <>
            <Text style={styles.kicker}>{t.language.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.language.title}
            </Text>
            <View style={styles.langList}>
              {/* Liste `LOCALES`ten türer; yeni dil açılınca ekran kendiliğinden öğrenir. */}
              {LOCALES.map((option) => {
                const isSelected = option === locale;
                return (
                  <PressableSurface
                    key={option}
                    onPress={() => pickLanguage(option)}
                    feedback="scale"
                    selected={isSelected}
                    style={[styles.langRow, isSelected ? styles.langRowSelected : undefined]}
                    accessibilityLabel={t.language.names[option]}
                    testID={`onboarding-language-${option}`}
                  >
                    <Text style={[styles.langName, isSelected ? styles.langNameSelected : styles.langNameIdle]}>
                      {t.language.names[option]}
                    </Text>
                    {isSelected ? <Text style={[styles.langName, styles.langNameSelected]}>✓</Text> : null}
                  </PressableSurface>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.kicker}>{t.fontSize.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.fontSize.title}
            </Text>
            {/* Örnek, ürün detayının küçültülmüş kesiti: her satır kendi durağından okuduğu için seçim değişince kartın tamamı
                birlikte ölçeklenir. */}
            <View style={styles.sampleCard} testID="onboarding-font-sample">
              <View style={styles.sampleHead}>
                <View style={styles.sampleText}>
                  <Text style={styles.sampleEyebrow}>{t.fontSize.sampleCard.eyebrow}</Text>
                  <Text style={styles.sampleTitle}>{t.fontSize.sampleCard.name}</Text>
                  <Text style={styles.sampleMeta}>{t.fontSize.sampleCard.meta}</Text>
                </View>
                <Text style={styles.samplePrice}>{t.fontSize.sampleCard.price}</Text>
              </View>
              <Text style={styles.sampleBody}>{t.fontSize.sampleCard.body}</Text>
            </View>
            <View style={styles.langList}>
              {FONT_SCALES.map((option) => {
                const isSelected = option === fontScale;
                return (
                  <PressableSurface
                    key={option}
                    onPress={() => pickScale(option)}
                    feedback="scale"
                    selected={isSelected}
                    style={[styles.langRow, isSelected ? styles.langRowSelected : undefined]}
                    accessibilityLabel={t.fontSize.options[option]}
                    testID={`onboarding-font-${option}`}
                  >
                    <Text style={[styles.langName, isSelected ? styles.langNameSelected : styles.langNameIdle]}>
                      {t.fontSize.options[option]}
                    </Text>
                    {isSelected ? <Text style={[styles.langName, styles.langNameSelected]}>✓</Text> : null}
                  </PressableSurface>
                );
              })}
            </View>
            <Text style={styles.scaleNote}>{t.fontSize.note}</Text>
          </>
        ) : null}

        {/* Posta kodu, neden istendiğini anlatan teslimat adımından sonra sorulur; sebebini bilmeyen kişi alanı boş geçer. */}
        {step === 3 ? (
          <>
            <Text style={styles.kicker}>{t.zip.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.zip.title}
            </Text>
            <Text style={styles.body}>{t.zip.body}</Text>
            <TextInput
              value={zip}
              onChangeText={onZipChange}
              placeholder={zipCopy.placeholder}
              placeholderTextColor={theme.colors.muted}
              keyboardType="number-pad"
              style={styles.zipInput}
              accessibilityLabel={zipCopy.field}
              testID="onboarding-zip"
            />
            {/* Cevap alanı hep ayrılmış, içerik gelince ekran zıplamaz. Beklerken iskelet cevabın şeklini taklit eder: kısa
                satır yer adı, uzun satır teslimat cümlesi. */}
            <View style={styles.zipAnswer}>
              {zipPending ? (
                <View style={styles.zipSkeleton} testID="onboarding-zip-skeleton">
                  <Skeleton width={140} height={theme.text.control} radius="badge" />
                  <Skeleton width="100%" height={theme.text.note} radius="badge" tone="soft" />
                </View>
              ) : null}
              {placeName === null ? null : (
                <Text style={styles.zipPlace} testID="onboarding-zip-place">
                  {zip} · {placeName}
                </Text>
              )}
              {zipNote === null ? null : (
                <Text style={[styles.zipNote, zipInside ? styles.zipNoteInside : styles.zipNoteShipping]} testID="onboarding-zip-note">
                  {zipNote}
                </Text>
              )}
            </View>
          </>
        ) : null}

        {/* Teslimat adımı bir vaat değil sistemin kuralını anlatır ve posta kodu sorusunun gerekçesidir: müşteri bunu baştan
            bilirse "ürün neden görünmüyor" sorusu doğmaz. */}
        {step === 2 ? (
          <>
            <Text style={styles.kicker}>{t.delivery.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.delivery.title}
            </Text>
            <Text style={styles.body}>{t.delivery.body}</Text>
            <View style={styles.payList}>
              {deliveryRows.map((row, index) => (
                <View key={row.key} style={[styles.payRow, index < deliveryRows.length - 1 ? styles.payRowDivider : undefined]}>
                  {row.icon}
                  <View style={styles.payText}>
                    <Text style={styles.payTitle}>{row.copy.title}</Text>
                    <Text style={styles.paySub}>{row.copy.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.secureBox}>
              <CustomerIcon name="truck" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
              <Text style={styles.secureText}>{t.delivery.note}</Text>
            </View>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={styles.kicker}>{t.payment.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.payment.title}
            </Text>
            <View style={styles.payList}>
              {paymentRows.map((row, index) => (
                <View key={row.key} style={[styles.payRow, index < paymentRows.length - 1 ? styles.payRowDivider : undefined]}>
                  {row.icon}
                  <View style={styles.payText}>
                    <Text style={styles.payTitle}>{row.copy.title}</Text>
                    <Text style={styles.paySub}>{row.copy.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.secureBox}>
              <CustomerIcon name="lock" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
              <Text style={styles.secureText}>{t.payment.secure}</Text>
            </View>
          </>
        ) : null}

        {/* Puanın giriş kartı oranı ve en güçlü sayıyı söyler, döküm sonraki kartlarda. Kural kimliksiz uçtan gelir; okunamazsa
            kutu çizilmez ve nedeni yazılır. */}
        {step === POINTS_INTRO_STEP ? (
          <>
            <Text style={styles.kicker}>{t.points.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.points.title}
            </Text>
            <Text style={styles.body}>{t.points.body}</Text>

            {/* Okunamayan kural kendi stiliyle söylenir: `scaleNote` yardımcı ipucudur, bu cümle ise ekranın cevabı. */}
            {pointsRules.status === 'failed' ? (
              <Text style={styles.pointsUnavailable} testID="onboarding-points-unavailable">
                {t.points.unavailable}
              </Text>
            ) : null}

            {pointsRules.status === 'ready' ? (
              <>
                <View style={styles.secureBox}>
                  <CustomerIcon name="coupon" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
                  <View style={styles.pointsHeadline}>
                    <Text style={styles.pointsRate} testID="onboarding-points-rate">
                      {t.points.rate
                        .replace('{points}', String(pointsRules.rules.redeem.minimumPoints))
                        .replace('{value}', formatCompactEuro(pointsRules.rules.redeem.valueCents, locale))}
                    </Text>
                    {referralValueCents === null ? null : (
                      <Text style={styles.pointsHighlight} testID="onboarding-points-highlight">
                        {t.points.highlight.replace('{value}', formatCompactEuro(referralValueCents, locale))}
                      </Text>
                    )}
                  </View>
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {/* Grup kartlarının satırlarını hesap ekranındaki `PointsEarnList` çizer, grubun yollarına daraltılmış kümeyle; ikinci
            bir çizici aynı ödülü iki biçimde anlatırdı. */}
        {groupIndex >= 0 && groupIndex < pointsGroups.length && pointsRules.status === 'ready'
          ? (() => {
              const group = pointsGroups[groupIndex];
              if (group === undefined) return null;
              const copy = t.points.groups[group.key];
              return (
                <View key={group.key} style={styles.groupCard} testID={`onboarding-points-group-${group.key}`}>
                  <Text style={styles.kicker}>{t.points.kicker}</Text>
                  <Text style={styles.title} accessibilityRole="header">
                    {copy.title}
                  </Text>
                  <Text style={styles.body}>{copy.body}</Text>
                  <PointsEarnList rules={{ ...pointsRules.rules, earnWays: group.ways }} testID={`onboarding-points-ways-${group.key}`} />
                </View>
              );
            })()
          : null}
      </FormScroll>

      <View style={styles.footer}>
        {/* Geri, nokta göstergesiyle aynı satırda solda; ilk adımda yer tutar ama görünmez ki noktalar kaymasın. */}
        <View style={styles.footerNav}>
          <View style={styles.footerSide}>
            {step === 0 ? null : (
              <PressableSurface
                onPress={() => setStep(step - 1)}
                feedback="opacity"
                compact
                accessibilityLabel={t.back}
                testID="onboarding-back"
              >
                <Text style={styles.backLink}>‹ {t.back}</Text>
              </PressableSurface>
            )}
          </View>
          <StepDots
            count={stepCount}
            active={step}
            accessibilityLabel={t.step.replace('{n}', String(step + 1)).replace('{total}', String(stepCount))}
            testID="onboarding-dots"
          />
          <View style={styles.footerSide} />
        </View>
        {/* Ana düğme puan öncesi "Devam", puanın giriş kartında "Nasıl puan kazanılır?", son kartta hesap teklifidir: teklif
            ancak puan anlatıldıktan sonra gelir. "Sonra bakarım" bölümün tamamında durur ve onboarding'i yine bitmiş sayar. */}
        <PrimaryButton
          label={isLastStep ? t.points.signUp : step === POINTS_INTRO_STEP ? t.points.how : t.next}
          onPress={next}
          testID="onboarding-next"
        />
        {inPointsSection ? (
          <PressableSurface
            onPress={() => finish('/')}
            feedback="opacity"
            compact
            accessibilityLabel={t.points.later}
            testID="onboarding-later"
          >
            <Text style={styles.laterLink}>{t.points.later}</Text>
          </PressableSurface>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.space['2xs'],
    paddingHorizontal: theme.space['6xl'],
    marginBottom: -theme.space.md,
  },
  /* Genişlik orandan hesaplanır, `aspectRatio`ya bırakılmaz: satır kabında `height + aspectRatio` çözülmez, görsel ham
     boyuna düşüp "Atla"yı dışarı iter. */
  logo: {
    height: customerMetrics.onboardingLogoHeight,
    width: customerMetrics.onboardingLogoHeight * LOGO_ASPECT,
  },
  skip: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
    padding: theme.space.md,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.space['7xl'],
    gap: theme.space['2xl'],
  },
  contentCenter: { justifyContent: 'center' },
  /* `flex: 1` değil: kaydırıcı kabında yüksekliği ekrana çiviler ve uzun içerik kırpılırdı. */
  contentGrow: { flexGrow: 1 },
  kicker: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  // Satır oranı bilerek `h1`inki: tasarımın 1,12'sine en yakın durak.
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  /* Adımın asıl anlatımı `body` (15), `control` değil: `control` düğme ve süzgeç durağıdır, karar için okunan metin 14'ün
     altına inmez. */
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.body,
    lineHeight: theme.text.body * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Yazı boyutu örneği: her satır gerçek ekranın kendi durağını kullanır, seçim temayı güncelleyince kart canlı ölçeklenir. */
  sampleCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.md,
  },
  sampleHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  sampleText: { flex: 1, gap: theme.space['2xs'] },
  sampleEyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  sampleTitle: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['card-title'],
    lineHeight: theme.text['card-title'] * theme.text['h1-sm--line-height'],
    color: theme.colors.ink,
  },
  sampleMeta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  samplePrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
    color: theme.colors['sand-50'],
    backgroundColor: theme.colors.terracotta,
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    overflow: 'hidden',
  },
  sampleBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  scaleNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  langList: {
    gap: theme.space.lg,
    marginTop: theme.space.md,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    borderRadius: theme.radius.control,
    paddingVertical: theme.space['3xl'],
    paddingHorizontal: theme.space['4xl'],
  },
  langRowSelected: { backgroundColor: theme.colors.olive },
  langName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
  },
  langNameSelected: { color: theme.colors.card },
  langNameIdle: { color: theme.colors.ink },
  // Harf aralığı rozet kademesinden, çünkü .06em'lik tek durak o.
  zipInput: {
    height: ZIP_FIELD_HEIGHT,
    borderWidth: theme.border.base,
    borderColor: theme.colors.ink,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space['5xl'],
    backgroundColor: theme.colors.card,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.lead,
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text.lead),
    color: theme.colors.ink,
  },
  /* Yükseklik sabit: içerik gelince ekran zıplamaz. */
  zipAnswer: {
    minHeight: ZIP_NOTE_HEIGHT,
    gap: theme.space.xs,
  },
  /* İskeletin çubuk aralığı cevabın satır aralığıyla aynı durak: bekleyişten cevaba geçişte hiçbir şey oynamaz. */
  zipSkeleton: {
    gap: theme.space.xs,
    paddingTop: theme.space['2xs'],
  },
  zipPlace: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  zipNote: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
  },
  zipNoteInside: { color: theme.colors['olive-dark'] },
  zipNoteShipping: { color: theme.colors.body },
  payList: { marginTop: theme.space.xs },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingVertical: theme.space.xl,
  },
  // Ayraç deseni kitin `NavRow` ayracıyla aynı.
  payRowDivider: {
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  payText: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  /* Satır başlığı `body` (15), açıklamasından (14) büyük kalsın diye; kalın olması boyut farkını kapatmaz. */
  payTitle: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  /* Açıklama `body-sm` (14): bu satırlar adımın asıl içeriği, `helper` ise formların yardımcı ipucu kademesi. */
  paySub: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  secureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.soft,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
  },
  /* Güvence `note` (13): listenin kendisi değil kapanış cümlesi olduğu için bir kademe altta. */
  secureText: {
    flex: 1,
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
  },
  footer: {
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['2xl'],
  },
  /* Üç sütun (geri · noktalar · boş): noktalar ortada kalır, geri düğmesi onları kaydırmaz. */
  footerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerSide: { flex: 1 },
  /* Grup kartının kendi dolgusu yok: dış boşluk `content`ten gelir, ikinci çerçeve kart dilini kutu diline çevirirdi. */
  groupCard: { gap: theme.space['2xl'] },
  /* Puan başlığının iki satırı: oran ve en güçlü sayı. */
  pointsHeadline: { flex: 1, gap: theme.space['2xs'] },
  /* Oran satırı kutunun en yüksek kademesi (`body`), çünkü müşterinin aklında kalması istenen sayı o. `secureText` kullanılmaz:
     taşıdığı `flex: 1` bu dikey yığında yüksekliği sıfıra çeker. */
  pointsRate: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors['olive-dark'],
  },
  /* Kural okunamadığında söylenen cümle içerik kademesinde (14), yardımcı ipucu kademesinde değil. */
  pointsUnavailable: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Vurgu satırı oranın bir kademe altında ama içerik sınırının üstünde: ekranın ikinci iddiası. */
  pointsHighlight: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
  },
  /* "Sonra bakarım" ana düğmenin altında ve sessiz: reddetme değil, ertelenmiş bir evet. */
  laterLink: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
    textAlign: 'center',
    paddingVertical: theme.space.sm,
  },
  backLink: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
    paddingVertical: theme.space.sm,
    paddingRight: theme.space.md,
  },
}));
