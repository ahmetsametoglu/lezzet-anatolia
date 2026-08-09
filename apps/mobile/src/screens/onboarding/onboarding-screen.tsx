import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { setAppLocale, useAppLocale } from '@/lib/i18n/app-locale';
import { saveOnboarding } from '@/lib/onboarding/onboarding-store';
import { maskPostalCode, usePlaceResolution } from '@/lib/places/use-place-resolution.hook';
import { applyFontScale, FONT_SCALES, saveFontScale, type FontScale } from '@/lib/settings/font-scale';
import { publishToast } from '@/lib/toast/toast-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { emToDp } from '@/theme/parse';
import { StepDots } from './step-dots';
import messages from './messages.json';

/*
  ONBOARDING (v3 `ob`, 00-ortak:272-338 + kurucu 641-652) — ilk açılışın dört adımı: dil seçimi →
  posta kodu → soğuk zincir → ödeme yolları. "Atla" her adımda çıkıştır; her iki çıkış da (bitir/
  atla) seçimleri cihaza yazar (`lib/onboarding`) ve vitrine döner. Kapı kök layout'ta
  (`use-onboarding-gate.hook.ts`).

  DİL SEÇİMİ EKRANIN DİLİNİ ANINDA DEĞİŞTİRİR (kullanıcı kararı 09.08 — v3'ün tersi). Prototipte
  seçim yalnız `lang` durumunu yazıyordu ve toast'ı bunu açıkça söylüyordu ("prototip arayüzü
  Türkçe kalır"); o, tasarımın DEĞİL prototipin sınırıydı. Ürün kararı şudur: dil kullanıcının
  seçimidir ve seçildiği anda geçerlidir — Français'ya basan kişi ekranın Türkçe kalmasını
  "seçimim işlemedi" diye okur. Seçim tek kaynağa yazılır (`lib/i18n/app-locale`), ağaç oradan
  beslendiği için bu ekran da dahil her yüzey aynı karede döner.

  SEÇİM BURADA MİSAFİRİN CEVABIDIR ve cihazda kalır; hesap açılınca OTP çağrısının `locale`iyle
  YENİ kartın `preferred_language`ına tohumlanır (zincirin tamamı `lib/i18n/app-locale` künyesinde).
  Bu ekrandan profile AYRICA bir yazma yapılmaz — ikinci bir yol tohumla yarışırdı.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Bitişteki toast ("Hoş geldiniz — afiyetle! ✓") ÇİZİLMEDİ**: toast kabuk katmanına ait ve o
     katman henüz yok — vitrin ile sepetin aynı gerekçeyle verdiği karar (home-screen sapma 1).
  2. **CTA yüksekliği 52** (şablon 54): birincil blok düğme kitte tek durak (`controlLg`); iki
     dp'lik ikinci bir durak açmak kitin kendi sözlüğünü bozardı.
  3. **Soğuk zincir fotoğrafı boş kum yüzey**: pakette gömülü ürün fotoğrafı varlığı yok (assets
     yalnız logo/ikon); şablonun `image-slot`ı da kaynak yokken boş yer tutucu çizer
     (`placeholder=" "`). Fotoğraf varlığı geldiğinde tek satır değişir.
  4. **Posta kodu girdisi kitin `TextField`ı değil**: tasarım burada büyük-kalın bir varyant
     çiziyor (56 yükseklik · mürekkep çerçeve · 18/700 harf aralıklı); kitte bu varyant yok ve
     kit bu etapta yazıya kapalı — varyantın kite terfisi raporlandı.
  5. **"Havale" ikonu kitin `warehouse` geometrisi**: v3'ün bina ikonu ondan 1–2 birim farklı;
     neredeyse özdeş ikinci bir geometri açmak "hangisi doğru" sorusunu doğururdu (CLAUDE §1).
  6. **Dil önseçimi uygulamanın o anki dili**: şablon 'TR' ile açılıyor — o, prototipin o anki
     uygulama dili; uygulamadaki karşılığı `useAppLocale()` (ilk açılışta cihaz dili).
*/

type Messages = LocalizedCopy<typeof messages>;

/** Adım sayısı ve sırası v3'ün kendisi (s1 dil · s2 posta kodu · s3 soğuk zincir · s4 ödeme). */
const STEP_COUNT = 5;

/** Dil seçiminin kendiliğinden ilerleme gecikmesi (v3: `setTimeout(…, 250)`). */
const LANGUAGE_ADVANCE_MS = 250;

/** Logonun kaynak oranı (1244×602) — login ekranındaki sabitin ikizi; ortak durağa terfisi raporlandı. */
const LOGO_ASPECT = 1244 / 602;

/** Soğuk zincir görselinin yüksekliği (v3:299 — 228). Yapısal ölçü, yuvarlanmaz; terfisi raporlandı. */

/** Posta kodu girdisinin yüksekliği (v3:294 — 56; kitin `controlLg` durağı 52). Terfisi raporlandı. */
const ZIP_FIELD_HEIGHT = 56;

/** Ödeme satırı ikonlarının kenarı (v3:314 — 21). Terfisi raporlandı. */
const PAYMENT_ICON_SIZE = 21;

/**
 * Not alanının SABİT yüksekliği (kullanıcı bulgusu 09.08): cevap gelince satır belirip
 * altındakileri aşağı itiyordu. Alan hep ayrılır, içi boşken görünmez — iki satırlık en uzun
 * cümleye göre ölçüldü (kargo notu).
 */
const ZIP_NOTE_HEIGHT = 64;

export function OnboardingScreen() {
  /* Seçim AYRI BİR DURUMDA TUTULMAZ: uygulamanın dili zaten seçimin kendisidir (tek kaynak) —
     ikinci bir `selected` durumu, aynı cevabın ekran-yerel ikinci kopyası olurdu. */
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [fontScale, setFontScale] = useState<FontScale>('normal');
  const [zip, setZip] = useState('');
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const pickLanguage = (next: Locale) => {
    // Anında uygulanır VE cihaza yazılır: bu ekranın metni de aynı karede seçilen dile döner.
    void setAppLocale(next);
    // Tasarım: seçimden 250 ms sonra kendiliğinden posta kodu adımı (v3 `ob.langs[].pick`).
    if (advanceTimer.current !== null) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      // Yalnız ilk adımdan ilerletir: gecikme sırasında "Devam"la ilerleyen kullanıcı geri sarılmaz.
      setStep((current) => (current === 0 ? 1 : current));
    }, LANGUAGE_ADVANCE_MS);
  };

  /* Seçim ANINDA uygulanır (kullanıcı kararı 09.08): örnek metin ve tüm arayüz birlikte
     büyür — kullanıcı kıyası gözüyle yapar. Kalıcı yazım çıkışta (`leave`). */
  const pickScale = (next: FontScale) => {
    setFontScale(next);
    applyFontScale(next);
  };

  // Maske de çözüm de ORTAK kapıdan (`lib/places`): aynı soruyu vitrinin teslimat çekmecesi de
  // soruyor ve iki kopya bir gün ayrışırdı.
  const onZipChange = (value: string) => setZip(maskPostalCode(value));

  /* YER ÇÖZÜMÜ GERÇEK UÇTAN (kullanıcı kararı 09.08 — eski yerel '67' kuralı kalktı): kod beş
     haneye ulaşınca sorulur, cevap ŞEHRİ de söyler. Davranışın gerekçeleri hook'un künyesinde. */
  const place = usePlaceResolution(zip);

  /* Ekranda söylenen cümle — dört hâlin her biri KENDİ cümlesini alır; bilinmeyen kod bir kapı
     değil uyarıdır, çözülemeyen hâl ise BİZİM eksiğimiz olabilir (sözleşme künyesi). */
  const zipInside = place?.kind === 'resolved' && place.place.inRoute;
  const placeName = place?.kind === 'resolved' ? place.place.placeName : null;
  const zipNote =
    place === null
      ? null
      : place.kind === 'resolved'
        ? place.place.inRoute
          ? t.zip.insideNote
          : t.zip.shippingNote
        : place.kind === 'ambiguous'
          ? t.zip.ambiguousNote
          : place.kind === 'unknown'
            ? t.zip.unknownNote
            : t.zip.unresolvedNote;

  /** Her iki çıkış da (bitir/atla) o ana dek yapılan seçimleri saklar — yarım bilgi de bilgidir. */
  const leave = () => {
    void saveOnboarding({ done: true, locale, postalCode: zip === '' ? null : zip });
    void saveFontScale(fontScale);
    router.replace('/');
  };

  const next = () => {
    if (step < STEP_COUNT - 1) setStep(step + 1);
    else {
      leave();
      // Karşılama toast'ı yalnız BİTİR'de (v3:649 `next` dalı) — Atla sessiz çıkar, v3'te de öyle.
      publishToast(t.doneToast);
    }
  };

  /* İki teslimat yolu — sistemin kuralı (kullanıcı kararı 09.08): rota içi kendi soğutuculu
     aracımız, dışı kargo; kargo soğuk zincir taşımaz ve katalog bu yüzden posta koduna göre süzülür. */
  const deliveryRows = [
    {
      key: 'route',
      icon: <CustomerIcon name="truck" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.delivery.route,
    },
    {
      key: 'shipping',
      // Kargo satırı KOLİ ikonuyla (kullanıcı bulgusu 09.08): depo/ev geometrisi kargoyu değil
      // binayı anlatıyordu — iki satırın ayrımı "araç ↔ koli" olarak okunmalı.
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
    {
      key: 'transfer',
      icon: <Icon name="warehouse" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.payment.transfer,
    },
  ] as const;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {/* Login ekranıyla aynı varlık ve ölçü: şeffaf PNG, yükseklik 52, genişlik orandan. */}
        <Image
          // Statik varlık Metro'da `require` ile yüklenir (login ekranındaki hükümle aynı):
          // kural TS import disiplinine bakıyor, varlık yolunu bilmiyor.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../../assets/images/logo.png')}
          style={styles.logo}
          accessibilityLabel={t.brand}
        />
        <PressableSurface
          onPress={leave}
          feedback="opacity"
          compact
          accessibilityLabel={t.skip}
          testID="onboarding-skip"
        >
          <Text style={styles.skip}>{t.skip}</Text>
        </PressableSurface>
      </View>

      {/* TÜM adımlar dikeyde ortalanır. v3'ün "üstten akan" istisnası fotoğraflı soğuk zincir
          adımınındı; o adım kalkınca (kullanıcı kararı 09.08) istisna da kalktı — kalan tek
          hizalama kuralı ortalamadır (kullanıcı bulgusu: teslimat adımı tepeye yapışıyordu). */}
      <View style={[styles.content, styles.contentCenter]}>
        {step === 0 ? (
          <>
            <Text style={styles.kicker}>{t.language.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.language.title}
            </Text>
            <View style={styles.langList}>
              {/* Liste `LOCALES`ten türer (hesap ekranı emsali) — yeni dil açıldığında ekran kendiliğinden öğrenir. */}
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

        {/* YAZI BOYUTU (kullanıcı kararı 09.08 — v3'te YOK, söz tasarımı ezer): dilden hemen
            sonra; örnek metin theme'den okuduğu için seçimle birlikte CANLI büyür/küçülür. */}
        {step === 1 ? (
          <>
            <Text style={styles.kicker}>{t.fontSize.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.fontSize.title}
            </Text>
            {/* ÖRNEK: ürün detayının küçültülmüş kesiti (kullanıcı kararı 09.08) — düz bir cümle
                yerine gerçekten okunacak yüzey gösterilir; her satır kendi durağından okuduğu için
                seçim değişince kartın TAMAMI birlikte ölçeklenir (fiyat rozeti dahil). */}
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

        {step === 2 ? (
          <>
            <Text style={styles.kicker}>{t.zip.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.zip.title}
            </Text>
            <Text style={styles.body}>{t.zip.body}</Text>
            <TextInput
              value={zip}
              onChangeText={onZipChange}
              placeholder={t.zip.placeholder}
              placeholderTextColor={theme.colors.muted}
              keyboardType="number-pad"
              style={styles.zipInput}
              accessibilityLabel={t.zip.field}
              testID="onboarding-zip"
            />
            {/* Cevap alanı HEP AYRILMIŞ (kullanıcı bulgusu 09.08): içerik gelince ekran zıplamaz. */}
            <View style={styles.zipAnswer}>
              {placeName === null ? null : (
                <Text style={styles.zipPlace} testID="onboarding-zip-place">
                  {zip} · {placeName}
                </Text>
              )}
              {zipNote === null ? null : (
                <Text
                  style={[styles.zipNote, zipInside ? styles.zipNoteInside : styles.zipNoteShipping]}
                  testID="onboarding-zip-note"
                >
                  {zipNote}
                </Text>
              )}
            </View>
          </>
        ) : null}

        {/* TESLİMAT MANTIĞI (kullanıcı kararı 09.08 — v3'ün "soğuk zincir" anlatısının YERİNE):
            burada anlatılan bir vaat değil SİSTEMİN KURALI — katalog posta koduna göre süzülür,
            iki teslimat yolu vardır ve kargo soğuk zincir ürünü taşımaz. Müşteri bunu baştan
            bilirse "ürün neden görünmüyor" sorusu hiç doğmaz. */}
        {step === 3 ? (
          <>
            <Text style={styles.kicker}>{t.delivery.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.delivery.title}
            </Text>
            <Text style={styles.body}>{t.delivery.body}</Text>
            <View style={styles.payList}>
              {deliveryRows.map((row, index) => (
                <View
                  key={row.key}
                  style={[styles.payRow, index < deliveryRows.length - 1 ? styles.payRowDivider : undefined]}
                >
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
                <View
                  key={row.key}
                  style={[styles.payRow, index < paymentRows.length - 1 ? styles.payRowDivider : undefined]}
                >
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
      </View>

      <View style={styles.footer}>
        {/* Geri (kullanıcı isteği 09.08 — v3'te yok): nokta göstergesiyle AYNI satırda, solda.
            İlk adımda yer TUTAR ama görünmez — noktalar sayfa değiştikçe yana kaymasın. */}
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
            count={STEP_COUNT}
            active={step}
            accessibilityLabel={t.step.replace('{n}', String(step + 1)).replace('{total}', String(STEP_COUNT))}
            testID="onboarding-dots"
          />
          <View style={styles.footerSide} />
        </View>
        <PrimaryButton
          label={step === STEP_COUNT - 1 ? t.start : t.next}
          onPress={next}
          testID="onboarding-next"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  // v3:274 — `padding:2px 22px 0; margin-bottom:-8px`; logo solda, "Atla" sağda.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.space['2xs'],
    paddingHorizontal: theme.space['6xl'],
    marginBottom: -theme.space.md,
  },
  /* Genişlik ORANDAN HESAPLANIR, `aspectRatio`ya bırakılmaz (cihaz kanıtı 09.08): satır
     kapsayıcısında `height + aspectRatio` ikilisi çözülmedi, resim HAM boyuna düşüp ekranı
     taşırdı ve "Atla"yı dışarı itti. İkisi de verilince ölçü kesin; oran yine tek kaynak. */
  logo: {
    height: customerMetrics.loginLogoHeight,
    width: customerMetrics.loginLogoHeight * LOGO_ASPECT,
  },
  // v3:276 — 700 12,5 soluk; rozet kademesi aynı çift (12,5/700), harf aralığı uygulanmaz.
  skip: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
    padding: theme.space.md,
  },
  // v3:278 — `flex:1; padding:0 26px; gap:13px` (13 → ölçeğin komşu durağı 14).
  content: {
    flex: 1,
    paddingHorizontal: theme.space['7xl'],
    gap: theme.space['2xl'],
  },
  contentCenter: { justifyContent: 'center' },
  // v3:280 — üstbaşlık kademesi token'ın kendisi (10/700/.18em), renk terracotta.
  kicker: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    color: theme.colors.terracotta,
  },
  // v3:281 — Lora 600 30 (`h1-sm`); satır oranı 1,12 → en yakın durak `h1` (1,15).
  title: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    lineHeight: theme.text['h1-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  // v3:293/307 — 400 13,5/1,55; login gövdesiyle aynı çeviri (`control` × `lead` oranı).
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.control,
    lineHeight: theme.text.control * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Yazı boyutu örneği — ürün detayının kesiti. Her satır gerçek ekranın kendi durağını kullanır
     (eyebrow · h1-sm · micro · button · body-sm): seçim temayı güncelleyince kart CANLI ölçeklenir
     ve kullanıcı kararı gerçek yüzey üzerinden verir. Ayrı bir "önizleme boyu" tutulmaz. */
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
  // v3:282 — `gap:10px; margin-top:8px`.
  langList: {
    gap: theme.space.lg,
    marginTop: theme.space.md,
  },
  // v3:284 — çerçeve HEP mürekkep (seçilide de), dolgu seçilide zeytin; `padding:15px 18px` (15 → 16).
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
  // v3:285 — 700 15 (`body` kademesi 15).
  langName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
  },
  langNameSelected: { color: theme.colors.card },
  langNameIdle: { color: theme.colors.ink },
  // v3:294 — 56 boy · mürekkep çerçeve · 700 18 (`lead`) · .06em (rozet aralığı, tek .06em durağı).
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
  // v3:295 — 600 13/1,5 (`note` × `lead` oranı; 1,5'lik durak yok, en yakını 1,6).
  /* Cevap alanı: yükseklik SABİT, içerik gelince ekran zıplamaz (kullanıcı bulgusu 09.08). */
  zipAnswer: {
    minHeight: ZIP_NOTE_HEIGHT,
    gap: theme.space.xs,
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
  // v3:312 — `margin-top:4px`.
  payList: { marginTop: theme.space.xs },
  // v3:313 — `gap:13px; padding:12px 0` (13 → 14).
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingVertical: theme.space.xl,
  },
  // Son satır çizgisiz (v3:321); ayraç deseni kitin `NavRow` ayracıyla aynı (kesikli kum).
  payRowDivider: {
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  payText: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  // v3:315 — 700 13,5 (`control` çifti birebir).
  payTitle: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  // v3:315 — 400 12/1,45 (`helper`; 1,45'lik durak yok, en yakını `lead` 1,6 — kitteki davet kutusuyla aynı çeviri).
  paySub: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  // v3:326 — `gap:10px; background:#efdfc2; border-radius:14px; padding:12px 15px` (15 → 16).
  secureBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.soft,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['3xl'],
  },
  // v3:328 — 600 12/1,45 koyu zeytin.
  secureText: {
    flex: 1,
    fontFamily: theme.font.body[600],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
  },
  // v3:332 — `padding:0 22px 30px; gap:14px`; alt güvenli alan payı login deseniyle aynı.
  footer: {
    paddingHorizontal: theme.space['6xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['2xl'],
  },
  /* Geri · noktalar · (boş) — üç sütun: noktalar ORTADA kalır, geri düğmesi onları kaydırmaz. */
  footerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerSide: { flex: 1 },
  backLink: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
    paddingVertical: theme.space.sm,
    paddingRight: theme.space.md,
  },
}));
