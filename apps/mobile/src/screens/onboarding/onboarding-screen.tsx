import { formatCompactEuro } from '@lezzet/helper';
import { LOCALES, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import type { MePointsEarnWayKey } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { FormScroll } from '@/components/ui/form-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { setAppLocale, useAppLocale } from '@/lib/i18n/app-locale';
import { saveOnboarding } from '@/lib/onboarding/onboarding-store';
/* YER NOTLARI ORTAK SÖZLÜKTEN (18.08 · MB-74'ün KÖKÜ): dört hâl cümlesi burada da yazılıydı ve
   `lib/places` ile birebir aynıydı — biri hariç. Bölge dışı cümlesi zamanla ayrışmış, onboarding
   *"soğuk zincir korumalı kargoyla ulaştırırız"* diyerek kargoya veremediğimiz bir şeyi vaat eder
   olmuştu. İki kopya varken hangisinin doğru olduğunu kimse göremez; kopya kaldırıldı. */
import placeMessages from '@/lib/places/messages.json';
import { maskPostalCode, usePlaceLookup } from '@/lib/places/use-place-resolution.hook';
import { applyFontScale, FONT_SCALES, saveFontScale, type FontScale } from '@/lib/settings/font-scale';
import { toastSuccess } from '@/lib/toast/toast-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { PointsEarnList } from '@/screens/customer-kit/points-earn-list';
import { usePointsRules } from '@/screens/customer-kit/use-points-rules.hook';
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

/** Puan ÖNCESİ adımlar: dil · yazı boyutu · posta kodu · teslimat · ödeme. */
const BASE_STEP_COUNT = 5;

/** Puan bölümünün GİRİŞ kartı — oranı ve en güçlü sayıyı söyler, dökümü değil. */
const POINTS_INTRO_STEP = BASE_STEP_COUNT;

/**
 * **PUAN KARTLARI — liste değil, grup grup** (kullanıcı kararı 13.08).
 *
 * ── NEDEN LİSTE DEĞİL ───────────────────────────────────────────────────────
 * İlk kurgu (12.08) altı yolu tek ekranda açılır bir liste olarak veriyordu. Kullanıcı cihazda
 * görüp eledi: *"listeyi beğendim, fakat bu liste HESAP SAYFASINDAN açılmak için uygun. Bilgi
 * verme stilimiz bu şekilde liste değil — onboarding KART KART bilgi veriyor."* Liste hesapta
 * kaldı (`points-earn-list` çekmecesi); burada aynı bileşen her kartta yalnız KENDİ grubunu çizer.
 *
 * ── GRUPLAR CEVABI OLAN BİR SORUYA GÖRE ─────────────────────────────────────
 * Ayrım "kaç puan" değil **"ne yaparak"**: birini çağırarak · aldığını anlatarak · sadece uğrayarak.
 * Müşteri kendini bir gruba yerleştirebilir ("ben alışveriş yapmam ama uğrarım"), oysa puan
 * sırasına göre bölünmüş bir liste yalnız bizim muhasebemizi anlatırdı.
 *
 * **Sıra ödülün büyüklüğüne göre:** en güçlü grup önce — kart kart ilerleyen müşteri en çok
 * kazandıran yolu ilk görür ve son karta gelmeden de tam cevabı almış olur.
 *
 * Anahtarlar SÖZLEŞMEDEN (`MePointsEarnWayKey`): sunucu bir yol eklerse ve buraya yazılmazsa o yol
 * hiçbir grupta çıkmaz — sessiz eksilme. Bu yüzden `satisfies` ile tam kapsam ARANMAZ ama
 * kapsanmayan anahtar `docs`ta değil KODDA görünür: `POINTS_GROUPS`un birleşimi tek yerdedir.
 */
const POINTS_GROUPS = [
  { key: 'invite', ways: ['referral', 'neighbor'] },
  { key: 'review', ways: ['review', 'feedback_purchase'] },
  { key: 'visit', ways: ['visit', 'feedback_candidate'] },
] as const satisfies readonly { key: string; ways: readonly MePointsEarnWayKey[] }[];

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

  /* Kural ekran açılır açılmaz istenir, son adıma gelince değil: müşteri beş adımı geçerken cevap
     çoktan gelmiş olur ve puan ekranı boş bir kareyle açılmaz. Kimliksiz uç, misafirde de çalışır. */
  const pointsRules = usePointsRules();

  /* Getiren ödülünün PARA karşılığı — listeden türer, sabit yazılmaz. Yol listede yoksa (ayar
     okunamadı) cümle hiç kurulmaz: söylenecek sayı yoksa susmak, uydurmaktan iyidir. */
  const referralWay = pointsRules.status === 'ready' ? pointsRules.rules.earnWays.find((w) => w.key === 'referral') : undefined;
  const referralValueCents =
    pointsRules.status === 'ready' && referralWay !== undefined ? referralWay.points * pointsRules.rules.centValue : null;

  /* ÇİZİLECEK GRUPLAR — kuraldan TÜRER, sabit değil. Ayarı okunamayan yol listeye hiç girmiyor
     (`readEarnWays` künyesi), yani bir grup boş kalabilir; boş grubun kartı da AÇILMAZ. Adım sayısı
     bu yüzden sabit bir sayı değil, gerçekten gösterilecek kart sayısıdır — "3/9" derken var
     olmayan bir kartı saymak, müşteriye tamamlanamayacak bir ilerleme göstermek olurdu. */
  const pointsGroups =
    pointsRules.status === 'ready'
      ? POINTS_GROUPS.map((group) => ({
          key: group.key,
          ways: pointsRules.rules.earnWays.filter((way) => (group.ways as readonly string[]).includes(way.key)),
        })).filter((group) => group.ways.length > 0)
      : [];

  const stepCount = POINTS_INTRO_STEP + 1 + pointsGroups.length;
  /** Grup kartındaysak kaçıncı grup; giriş kartında ve öncesinde `-1`. */
  const groupIndex = step - POINTS_INTRO_STEP - 1;
  const isLastStep = step === stepCount - 1;
  /** Alt şeritteki "Sonra bakarım" — puan bölümünün TAMAMINDA durur, öncesinde değil. */
  const inPointsSection = step >= POINTS_INTRO_STEP;

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
  /* Bekleyiş bayrağı hook'tan gelir, TÜRETİLMEZ: `place === null` "istek düştü" hâlini de kapsıyor
     ve türetilmiş bir bayrak orada sönmezdi — iskelet ebediyen dönerdi (künyesi hook'ta). */
  const { place, pending: zipPending } = usePlaceLookup(zip);

  /* Ekranda söylenen cümle — dört hâlin her biri KENDİ cümlesini alır; bilinmeyen kod bir kapı
     değil uyarıdır, çözülemeyen hâl ise BİZİM eksiğimiz olabilir (sözleşme künyesi). */
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
   * Her çıkış (bitir/atla/hesap aç) o ana dek yapılan seçimleri saklar — yarım bilgi de bilgidir.
   *
   * Hedef parametre çünkü son adımın İKİ çıkışı var (kullanıcı kararı 12.08): "Hesap aç" giriş
   * ekranına, "Sonra bakarım" vitrine. İkisi de onboarding'i BİTMİŞ sayar — kapı yeniden açılırsa
   * müşteri aynı beş adımı tekrar görürdü.
   */
  const leave = (target: '/' | '/login') => {
    void saveOnboarding({ done: true, locale, postalCode: zip === '' ? null : zip });
    void saveFontScale(fontScale);
    router.replace(target);
  };

  /** Son adımdan çıkış — hedef ne olursa olsun karşılama toast'ı basılır (Atla hâlâ sessiz). */
  const finish = (target: '/' | '/login') => {
    leave(target);
    // Karşılama toast'ı yalnız BİTİR dallarında (v3:649) — başlıktaki "Atla" sessiz çıkar.
    toastSuccess(t.doneToast);
  };

  const next = () => {
    if (!isLastStep) setStep(step + 1);
    // Son kart hesap açmayı önerir (kullanıcı kararı 13.08: *"en son adıma gelirse puan sisteminde,
    // o zaman hesap açmayı öneririz"*) — puanı anlatmadan hesap istemek, sebebini söylemeden
    // kapıda kimlik sormaktı.
    else finish('/login');
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
    /* İKON `warehouse` DEĞİL `money` (kullanıcı bulgusu 18.08). Havale satırı DEPO ikonu taşıyordu
       ve bir üstteki "kapıda ödeme" de `home` — ikisi de BİNA silüeti, cihazda bir bakışta
       ayrışmıyorlardı. Depo zaten anlamca da yanlıştı: havale bir paranın yer değiştirmesidir,
       bir binanın değil. `money` hem ayrı bir siluet hem doğru kavram; kitte zaten var, yeni ikon
       açılmadı (CLAUDE §3 — token yoksa kodlama, ama varsa da ikincisini yaratma). */
    {
      key: 'transfer',
      icon: <Icon name="money" size={PAYMENT_ICON_SIZE} color={theme.colors.olive} />,
      copy: t.payment.transfer,
    },
  ] as const;

  return (
    /* BOŞLUĞA DOKUNUNCA KLAVYE KAPANIR (kullanıcı bulgusu 11.08, iPhone'da yaşandı).

       Bu davranış RN'de PLATFORMDAN GELMEZ: arka plandaki `View` dokunuşu hiç yakalamaz, dokunma
       bir "responder" ister. Klavye yalnız üç yoldan kapanır — kaydırıcıda sürükleme
       (`keyboardDismissMode`), alanın blur olması, ya da açıkça `Keyboard.dismiss()`. Bu ekranda
       üçü de yoktu, yani boşluğa dokunmak gerçekten hiçbir şeye dokunmamaktı.

       Adım ÇIKIŞSIZ kalıyordu ve sebebi ikiliydi: posta kodu alanı `keyboardType="number-pad"`
       açıyor ve o klavyede iOS'ta return/Done tuşu YOK (Android'in ✓ tuşunun karşılığı yok);
       "Devam" düğmesi de alt şeritte, klavyenin altında. Ne kapatılabiliyor ne ilerlenebiliyordu.

       Katman ŞEFFAF ve geri bildirimsiz: kitin `PressableSurface`i değil ham `Pressable`, çünkü
       burada basılan bir yüzey yok — yalnız "boşluğa dokunuldu" haberi var. `accessible={false}`
       ekran okuyucuya ekranı tek bir devasa düğme gibi göstermemek için; içteki düğmeler kendi
       dokunuşlarını almaya devam eder (çocuk dokunulabilir öncelikli). */
    <Pressable style={styles.screen} onPress={Keyboard.dismiss} accessible={false}>
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
          onPress={() => leave('/')}
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
          hizalama kuralı ortalamadır (kullanıcı bulgusu: teslimat adımı tepeye yapışıyordu).

          KAYDIRICI KİTTEN (12.08): puan adımının açılabilir listesi altı satır ve ekrana sığmıyor;
          "Büyük" yazı boyutunda öteki adımlar da taşma sınırında. Ham `ScrollView` değil `FormScroll`
          çünkü bu ekranda metin alanı VAR (posta kodu) — kitin kabı klavye kaçınmasını ve "ilk
          dokunuş yutulmasın" korumasını birlikte taşıyor (künyesi `form-scroll.tsx`).
          `flexGrow` ortalamayı korur: içerik kısayken ortada durur, uzayınca kaydırılır. */}
      <FormScroll contentContainerStyle={[styles.content, styles.contentCenter, styles.contentGrow]} testID="onboarding-scroll">
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

        {/* POSTA KODU, TESLİMAT ANLATIMINDAN SONRA (kullanıcı kararı 13.08): *"posta kodunu
            istediğimiz sayfa, posta kodunu NEDEN istediğimizi anlattığımız sayfadan sonra
            olmalı."* Doğru sıra bu: bir kişisel veri istemeden önce ne işe yarayacağını söylemek,
            hem nezaket hem dönüşüm — sebebini bilmeyen kişi alanı boş geçiyor. Eskiden kod önce
            soruluyor, gerekçesi bir adım SONRA anlatılıyordu. */}
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
            {/* Cevap alanı HEP AYRILMIŞ (kullanıcı bulgusu 09.08): içerik gelince ekran zıplamaz.

                CEVAP BEKLENİRKEN İSKELET (kullanıcı isteği 13.08): alan eskiden boş duruyordu ve
                beş haneyi yazan kişi hiçbir şey olmuyormuş gibi bakıyordu — soru sunucuya gitti mi
                gitmedi mi belli değildi. İskelet cevabın ŞEKLİNİ taklit ediyor (bir kısa satır =
                yer adı, bir uzun satır = teslimat cümlesi), yani gelen şey ekranı yeniden
                düzenlemiyor. Boşluk ile iskelet arasındaki fark bir süsleme değil: biri "burada bir
                şey yok" der, öteki "birazdan burada bir şey olacak". */}
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
            bilirse "ürün neden görünmüyor" sorusu hiç doğmaz.

            POSTA KODUNDAN ÖNCE (kullanıcı kararı 13.08): bu kart artık sorunun GEREKÇESİ —
            "neden posta kodu istiyoruz"un cevabı burada, soru bir sonraki adımda. */}
        {step === 2 ? (
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

        {/* PUANIN GİRİŞ KARTI — oranı ve en güçlü sayıyı söyler, dökümü SÖYLEMEZ. Döküm sonraki
            kartların işi (kullanıcı kararı 13.08: onboarding kart kart bilgi verir).

            EKRAN SAYI UYDURMAZ: kural kimliksiz uçtan geliyor (`usePointsRules`), sabit gömülü
            tek bir puan yok. Okunamazsa kutu hiç çizilmez ve nedeni yazılır — uydurma bir sayı
            basmak, motorun vermeyeceği bir vaat vermektir (29.07 denetiminin arıza sınıfı). */}
        {step === POINTS_INTRO_STEP ? (
          <>
            <Text style={styles.kicker}>{t.points.kicker}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t.points.title}
            </Text>
            <Text style={styles.body}>{t.points.body}</Text>

            {/* Kural okunamadığında kendi durağıyla söylenir, `scaleNote`u ödünç ALMAZ: o bir
                yardımcı ipucu ("boyutu sonra değiştirebilirsiniz"), bu ise ekranın müşteriye
                verdiği CEVAP — neden sayı göremediğini ve nereden görebileceğini söylüyor. */}
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
                    {/* En güçlü sayı ayrıca söyleniyor ama UYDURULMUYOR: getiren ödülü listede
                        yoksa (ayar okunamadı) bu cümle de hiç çizilmez. */}
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

        {/* PUAN GRUP KARTLARI (kullanıcı kararı 13.08) — her kart bir SORUYA cevap verir:
            "birini çağırarak" · "aldığını anlatarak" · "sadece uğrayarak". Satırları çizen bileşen
            hesap ekranındakiyle AYNI (`PointsEarnList`); değişen tek şey ona verilen kümedir —
            `earnWays` grubun yollarına daraltılıyor. İkinci bir satır çizici yazsaydık aynı ödül
            iki farklı biçimde anlatılırdı (bileşenin kendi künyesindeki gerekçe). */}
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
                  <PointsEarnList
                    rules={{ ...pointsRules.rules, earnWays: group.ways }}
                    testID={`onboarding-points-ways-${group.key}`}
                  />
                </View>
              );
            })()
          : null}
      </FormScroll>

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
            count={stepCount}
            active={step}
            accessibilityLabel={t.step.replace('{n}', String(step + 1)).replace('{total}', String(stepCount))}
            testID="onboarding-dots"
          />
          <View style={styles.footerSide} />
        </View>
        {/* ANA DÜĞMENİN ÜÇ HÂLİ (kullanıcı kararı 13.08):
            · puan öncesi → "Devam"
            · puanın GİRİŞ kartı → **"Nasıl puan kazanılır?"** — soruyu düğmenin kendisi soruyor ve
              cevabı bir sonraki kart veriyor. Müşteri merakını bir açılır listeye değil, akışın
              kendisine bağlıyor.
            · son puan kartı → "Hesap aç, kazanmaya başla"
            Kural tek cümle: **hesap teklifi ancak puan anlatıldıktan SONRA gelir.** Grup kartı
            hiç yoksa (ayarlar okunamadı) giriş kartı zaten son karttır ve teklifi o yapar —
            cevabı olmayan bir soruyu sormaktansa.

            "Sonra bakarım" puan bölümünün TAMAMINDA durur: bir vazgeçme değil, gecikmiş bir evet —
            onboarding yine BİTMİŞ sayılır ve müşteri vitrine düşer.
            `t.start` ("Alışverişe başla") artık kullanılmıyor: bölümün son eylemi alışveriş değil
            hesap açmak. */}
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
  /* Kaydırıcının içeriği ekranı doldurmuyorsa ortalanır, doluyorsa uzayıp kaydırılır. `flex: 1`
     OLMAZ: kaydırıcı kabında yüksekliği ekrana çivilerdi ve uzun içerik kırpılırdı. */
  contentGrow: { flexGrow: 1 },
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
  /* ~~v3:293/307 — 400 13,5 (`control`)~~ → **`body` (15)**, kullanıcı bulgusu 13.08.
     Bu satır her adımın ASIL ANLATIMI (yeri neden soruyoruz · iki teslimat yolu · puan nasıl
     birikir) ve `control` bir DÜĞME/SÜZGEÇ durağıdır — kitin kendi sözlüğünde "süzgeç ve sıralama
     düğmesi" diye yazılı. Okunacak metni oraya koymak 21.38'in kapattığı arıza sınıfının aynısı:
     müşterinin karar için okuduğu metin 14'ün altına inmez. Kartın gövdesi satır açıklamalarından
     (`body-sm`, 14) bir kademe yukarıda durur — anlatım sırası boyutla da okunsun. */
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.body,
    lineHeight: theme.text.body * theme.text['lead--line-height'],
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
  /* İskeletin iki çubuğu arasındaki boşluk, gelecek metnin iki satırı arasındakiyle AYNI durak
     (`zipAnswer.gap`): bekleyiş ile cevap aynı ritimde durur, geçişte hiçbir şey oynamaz. */
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
  /* ~~v3:315 — 700 13,5 (`control`)~~ → **`body` (15)**, kullanıcı bulgusu 13.08.
     TERS KADEME ÖLÇÜLDÜ: 21.38 açıklamayı `helper`dan `body-sm`e (14) çıkarmış ama başlığa
     dokunmamıştı — satır başlığı 13,5'te kalıp KENDİ AÇIKLAMASINDAN küçük görünüyordu. Kalın
     olması farkı kapatmıyor; göz önce boyutu okur. Merdiven artık düz: başlık 15 · açıklama 14 ·
     güvence 13. */
  payTitle: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  /* ~~v3:315 — 400 12/1,45 (`helper`)~~ → **`body-sm` (14)**, kullanıcı bulgusu 11.08.
     Şablonun 12'si bu ekranda YANLIŞ durakdı: `helper` formların "yardımcı ipucu" basamağıdır,
     oysa bu satırlar teslimat ve ödeme adımlarının ASIL İÇERİĞİ — müşteri kuralı buradan okuyor.
     Ölçüldü: yazı boyutu "Büyük" seçilse bile `helper` 13,8 pikselde kalıyor, aynı ekranın üst
     gövdesi (`control`) 18,4'e çıkıyordu; yani aynı işi gören iki metin arasında kalıcı 4 px'lik
     bir uçurum vardı. Yeni merdiven: başlık 16 · açıklama 14 · güvence 13. */
  paySub: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
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
  /* ~~v3:328 — 600 12/1,45~~ → **`note` (13)**, `paySub` ile aynı gerekçe (üstteki künye).
     Bir tık altta kalıyor çünkü bu bir kapanış güvencesi, listenin kendisi değil. */
  secureText: {
    flex: 1,
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
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
  /* Grup kartı — kendi başlığını, cümlesini ve iki satırını taşır. Kabın kendi dolgusu YOK:
     adımın dış boşluğu zaten `content`ten geliyor; ikinci bir çerçeve, kart dilini kutu diline
     çevirirdi (v3'ün öteki adımları da çerçevesiz). Yalnız dikey ritmi tutar. */
  groupCard: { gap: theme.space['2xl'] },
  /* Puan başlığının iki satırı — oran ve en güçlü sayı; güvence kutusunun içinde, ikon sağında. */
  pointsHeadline: { flex: 1, gap: theme.space['2xs'] },
  /* Oran satırı `body` (15): ekranın SÖYLEDİĞİ tek sayı bu ("500 puan = 5,00 € kupon") ve
     müşterinin aklında kalması istenen şey o. Kutunun içindeki en yüksek kademe olması bilinçli. */
  pointsRate: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors['olive-dark'],
  },
  /* `secureText` YENİDEN KULLANILAMADI ve sebebi ölçüldü (cihazda, 12.08): o stil `flex: 1`
     taşıyor — güvence kutusunun SATIR düzeninde doğru (metin ikonun yanında kalan genişliği alır),
     ama burada kutunun içinde DİKEY bir yığın var ve dikeyde `flex: 1` yüksekliği içerikten değil
     kaptan almaya çalışıyor. Kap da içeriğe göre büyüdüğü için sonuç sıfır yükseklik: satır
     çiziliyor ama GÖRÜNMÜYORDU (uiautomator dökümünde metin düğümü hiç yoktu). Aynı görünen iki
     kademe için ayrı durak açmak değil, YANLIŞ EKSENİN stilini almamak söz konusu. */
  /* Kural okunamadığında söylenen cümle — içerik kademesinde (14), yardımcı ipucu kademesinde değil. */
  pointsUnavailable: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Vurgu satırı `body-sm` (14): oranın bir kademe altında ama içerik sınırının üstünde — bu bir
     güvence cümlesi değil, ekranın ikinci iddiası ("bir arkadaş 5,00 € kazandırır"). */
  pointsHighlight: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['olive-dark'],
  },
  /* "Sonra bakarım" — ana düğmenin ALTINDA ve sessiz: bir reddetme değil, ertelenmiş bir evet. */
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
