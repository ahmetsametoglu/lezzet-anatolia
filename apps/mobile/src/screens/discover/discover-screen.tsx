import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { DiscoverCard, FeedbackVote } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, ScrollView, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { publishToast } from '@/lib/toast/toast-store';
import { PointsAward, PointsSpark } from '@/screens/customer-kit/points-award';
import { HeartIcon } from '@/screens/feedback/feedback-icons';
import { emToDp, withAlpha } from '@/theme/parse';
import messages from './messages.json';
import { useDiscover } from './use-discover.hook';

/*
  KEŞİF TURU (v3 `vKesif` — YENİ SÜRÜM, v3:371-447 + `kv` kurucusu v3:2052-2070 + jest
  işleyicileri `kDown/kMove/kUp/kGo/kBack` v3:1805-1815) — aday ürünler kart kart gösterilir,
  müşteri beğenir ya da geçer; deste bitince teşekkür ve puan. Vitrinin kesikli davet kutusu ve
  hesap kartının "puan kazanma yolları" satırı buraya basıyor.

  ── YENİ SÜRÜMÜN GETİRDİKLERİ (bu turda uygulandı) ──────────────────────────
  1. **Gerçek kaydırma fiziği**: kart parmağı yatayda birebir, dikeyde %35 takip eder; eğim
     `x/16` derecedir ve gölgesi yöne göre RENK değiştirip mesafeyle koyulaşır (`kv.glow`).
  2. **Basılı rozetler**: "İSTERİM" (sol üst, zeytin, −13°) ve "BAŞKA SEFER" (sağ üst,
     terracotta, +13°); opaklıkları `min(1, |x|/92)`.
  3. **Yön ipuçları**: kartın üstünde iki kutu — sola/sağa kaydırmanın ne demek olduğunu ilk
     kartta söyler (öğrenilince de yer kaplamaya devam eder; tasarımın kararı).
  4. **Dilimli ilerleme çubuğu**: her aday bir dilim; geçilen zeytin, güncel terracotta ve iki
     kat geniş, gelecek kum.
  5. **Kart artık FOTOĞRAF**: ad ve tanıtım fotoğrafın ÜSTÜNDE, koyu gradyanın içinde durur —
     eski sürümde beyaz kartın altındaki künye bandındaydı.
  6. **"Geri al"**: başlık çubuğunun sağ yuvasında; sayaç oradan ilerleme çubuğuna taşındı.
  7. **Beğeni sayacı**: düğmelerin altında ve bitiş ekranında "N lezzet beğendiniz".

  ── "GERİ AL" DÜRÜSTLÜĞÜ ────────────────────────────────────────────────────
  Sunucuda oyu geri alan bir uç YOK. Bu yüzden geri alınabilirlik yazımın kendisinden doğuyor:
  bir kaydırma önce hook'un kuyruğunda bekler (`UNDO_WINDOW_MS`), pencere içinde geri alınırsa
  sunucuya HİÇ gitmez. Düğme yalnız gerçekten geri alınabilir bir oy varken etkindir; pencere
  dolunca soluklaşır (şablonun kendi `undoCol` ayrımı). Desteyi sessizce geri sarıp müşteriye
  "geri aldık" demek yanıltıcı olurdu — oy yazılmış ve talep sinyalinde kalmış olurdu.

  ── VERİ SÖZLEŞMESİNİN ÇİZİLEMEYEN İKİ ÖĞESİ (raporlandı) ───────────────────
  Şablonun kartında KATEGORİ rozeti (`kv.cur.c`) ve "N kişi istedi" çipi (`kv.cur.votes`) var;
  `DiscoverCardSchema` ikisini de TAŞIMIYOR (ad · tanıtım · görsel · ürün kimliği). Uydurma bir
  kategori ya da sayı yazmak olmayan bir veriyi varmış gibi göstermekti — çizilmediler ve
  sözleşme ihtiyacı yöneticiye raporlandı.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Deste yüksekliği ESNEK**: şablon 486 çiziyor; küçük telefonda sabit yükseklik düğmeleri
     ekranın dışına iter. Kart alanı kalan boşluğu alır, tavanı 486'da durur.
  2. **Boş deste hâli EKLENDİ** (şablonda yok, web'de var): aday kalmadığında tur BİTMEDİ, hiç
     başlamadı — iki hâl ayrı cümle ister.
  3. **İskelet ve ağ hatası hâlleri EKLENDİ**: gerçek uçtan okuyan her ekranın üç hâli olmalı.
  4. **Hızlı fırlatma da karardır**: şablon yalnız mesafeye bakıyor (92 px). Dokunmatikte kısa
     ama hızlı bir fırlatma da nettir; mesafe eşiğinin yanına hız eşiği eklendi (kaldırılsaydı
     parmağını çabuk çeken müşterinin kararı yok sayılırdı).
  5. **Kalp ikonu geri bildirim ekranından**: `vKesif` kalbi ile `vFb` kalbi AYNI geometri.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Bekleme dalının ilerleme dilimleri — destenin tipik uzunluğu (uç 10 kart veriyor). */
const SKELETON_SEGMENTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/*
  v3'te ölçülmüş, EKRANA-ÖZEL duraklar. Ölçü katmanları (`theme/metrics` + `customer-metrics`)
  bu görevde yazıya kapalı — ham değerler stillere DAĞITILMADI, tek yerde durur; katman
  açıldığında oraya terfi eder (raporlandı).
*/
const discoverMetrics = {
  /** Deste alanının yüksekliği (v3:403 — 486). Sapma 1: tavan olarak uygulanır. */
  deckHeight: 486,
  /** Kartın deste kutusunun ALT kenarından payı (v3:404-414 — `bottom:34px`). */
  deckFootroom: 34,
  /** Sıradaki kart (v3:409): aşağı kayma · küçülme · üstündeki krem tülün opaklığı. */
  nextDrop: 30,
  nextScale: 0.94,
  nextVeilOpacity: 0.55,
  /** Üçüncü kart (v3:406): yalnız derinlik — fotoğrafı yok, kum yüzey ve çerçeve. */
  thirdDrop: 56,
  thirdScale: 0.88,
  /** İlerleme çubuğunun dilimi (v3:385): yükseklik 4 · yarıçap 2 · durgun 10 · güncel 22. */
  segmentHeight: 4,
  segmentRadius: 2,
  segmentWidth: 10,
  segmentCurrentWidth: 22,
  /** Yön ipucu kutusunun satır yüksekliği (v3:393 — `12px/1.3`). */
  hintLineHeight: 1.3,
  /** Basılı rozetin eğimi (v3:418-419 — ∓13°) ve satır yüksekliği. */
  stampRotateDeg: 13,
  /** Kart adının satır yüksekliği (v3:421 — `27px/1.08`). */
  cardNameLineHeight: 1.08,
  /** Oy düğmeleri (v3:429-430 — 60 ve 72) ve ikonları (24 · 30). */
  passButton: 60,
  passIcon: 24,
  likeButton: 72,
  likeIcon: 30,
  /**
   * Bitişin kahraman işareti — şablonda 88'lik bir DAİRE ve içinde 38'lik `✦` vardı (v3:437).
   * Daire kaldırıldı (kullanıcı kararı 15.08, geri bildirim sonucundaki aynı gerekçe); ölçü
   * dairenin dış çapında KALDI, çünkü bloğun çevresindeki boşluk ona göre kurulmuştu.
   */
  thanksMark: 88,
  /** Kartın çıkışı (v3:24-25 `kOutL/kOutR` + `kGo`): 330 ms, %130 yol, 9° dönüş. */
  exitMs: 330,
  exitTravel: 1.3,
  exitRotateDeg: 9,
  /** Bırakılan kartın yerine oturması — çıkıştan kısa (geri dönüş bir olay değil, düzeltme). */
  returnMs: 220,
  /** Sürüklerken: dikey takip payı ve eğim böleni (v3:2060 — `y*.35`, `x/16`). */
  verticalFollow: 0.35,
  rotateDivisor: 16,
  /**
   * KART GÖLGESİ (v3:2063 `kv.glow`) — durgunken mürekkep, kaydırırken yönün rengi.
   * Token'ı YOK (kitin `soft`/`hard`/`badge` üçlüsü bu geometriyi taşımıyor); değerler
   * şablonun kendi ölçüleridir ve renkleri temadan gelir (`withAlpha`), ham hex yazılmaz.
   */
  glowOffsetY: 12,
  glowBlur: 32,
  glowAlpha: 0.16,
  dragGlowBlur: 34,
  dragGlowMinAlpha: 0.12,
  dragGlowMaxAlpha: 0.42,
  /** Beğen düğmesinin zeytin halesi (v3:430 — `0 8px 22px rgba(95,122,44,.42)`). */
  likeGlowOffsetY: 8,
  likeGlowBlur: 22,
  likeGlowAlpha: 0.42,
} as const;

/**
 * Oy sayılma eşiği — şablonun kendi ölçüsü (v3:1808, 2053: `|x| > 92`). Aynı sayı basılı
 * rozetlerin ve gölge yoğunluğunun ramp'ını da tanımlıyor (`kAbs = min(1, |x|/92)`), yani tek
 * durak: kart "karar verilmiş" görünmeye başladığı anda gerçekten karar eşiğindedir.
 */
const SWIPE_THRESHOLD = 92;

/**
 * Hız eşiği (dp/sn) — sapma 4. Şablonda yok; dokunmatikte kısa ama hızlı bir fırlatma da nettir
 * ve yüzen sayfanın (`bottom-sheet`) kapanma eşiğiyle bilerek AYNI sayı: iki yerde iki ayrı
 * "yeterince hızlı" tanımı olmasın.
 */
const SWIPE_VELOCITY = 900;

/** Çıkış eğrisi (v3 `kOutL/kOutR` — `ease-in`). */
const EXIT_EASING = Easing.in(Easing.ease);

/**
 * Halenin opaklığı — şablonun alfa hesabının (`0.12 + oran*0.3`) opaklığa çevrilmiş hâli:
 * katman en yüksek alfayla çizildiği için istenen alfa "istenen/azami" oranıyla elde edilir.
 * UI iş parçacığında koştuğu için `worklet` — modül düzeyinde durur ki her karede yeniden
 * kurulmasın.
 */
function glowOpacity(ratio: number): number {
  'worklet';
  const { dragGlowMinAlpha, dragGlowMaxAlpha } = discoverMetrics;
  return (dragGlowMinAlpha + ratio * (dragGlowMaxAlpha - dragGlowMinAlpha)) / dragGlowMaxAlpha;
}

/** "N lezzet beğendiniz" — 0 ve 1 kendi cümlelerini alır; "0 lezzet beğendiniz" cümle değildir. */
function likesLabel(copy: Messages, count: number): string {
  if (count === 0) return copy.likes.zero;
  if (count === 1) return copy.likes.one;
  return copy.likes.other.replace('{count}', String(count));
}

interface CardPhotoProps {
  card: DiscoverCard;
}

/** Kart fotoğrafı — görsel yoksa baş harf yer tutucusu (ürün/tarif ekranlarının davranışı). */
function CardPhoto({ card }: CardPhotoProps) {
  if (card.image.url === null) {
    return (
      <View style={styles.photoFallback}>
        <Text style={styles.photoInitial}>{card.name.slice(0, 1)}</Text>
      </View>
    );
  }
  return <Image source={{ uri: card.image.url }} style={styles.photoImage} accessibilityIgnoresInvertColors />;
}

/**
 * Uçuşun UI-THREAD kapanışı — jest ve düğme yolunun ortak sonu.
 *
 * MODÜL DÜZEYİNDE ve tekil bir worklet: bileşenin içinde kurulan bir worklet, animasyonun
 * tamamlanma çağrısına kapanışıyla birlikte taşınır ve her çizimde kimliği değişir. Modül
 * düzeyindeki bir bildirimde dönüşüm tartışmasız ve kimlik sabittir — iki giriş kapısının (jest ·
 * düğme) aynı kapanışı paylaşmasının da tek ucuz yolu bu.
 *
 * Sıra önemli: parmak izi ve kilit React'ten ÖNCE temizlenir. `finishExit`in commit'i geldiğinde
 * öne geçen kart ne eski izi okur ne kilidi açık görür.
 */
function clearFlight(
  flyingId: SharedValue<string | null>,
  dragX: SharedValue<number>,
  dragY: SharedValue<number>,
  locked: SharedValue<number>,
): void {
  'worklet';
  flyingId.value = null;
  dragX.value = 0;
  dragY.value = 0;
  locked.value = 0;
}

interface DeckLayerProps {
  card: DiscoverCard;
  /** 0 = üstteki kart, 1 = arkadaki. Değişince kart yeni derinliğine ANİMASYONLA gider. */
  depth: number;
  /** Parmağın yeri — yalnız `interactive` kartta okunur. */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  /** Parmağı izlesin mi: üstteki kart, ve yalnız uçan bir kart yokken. */
  interactive: boolean;
  /*
    UÇUŞ DEĞERLERİ — üstteki kart, kendisini uçan katmana taşıyan React commit'ini BEKLEMEDEN yola
    çıksın diye. Kart uçtuğunu `flyingId`den anlar; bayrak değil KİMLİK, çünkü bayrak olsaydı öne
    geçen yeni kart da onu okur ve o da uçardı. Uçan katman commit gelince aynı formülü devralır.
  */
  flyingId: SharedValue<string | null>;
  exitProgress: SharedValue<number>;
  exitStartX: SharedValue<number>;
  exitStartY: SharedValue<number>;
  exitDirection: SharedValue<number>;
  /** Kartın kat edeceği yol — ekran genişliğinden türer, uçuş boyunca sabit. */
  travel: number;
  glow: ReactNode;
  stamp: ReactNode;
  testID: string;
}

/**
 * DESTEDEKİ bir kart — kendi derinliğini bilir ve derinlik değişince oraya ANİMASYONLA gider.
 *
 * ── NEDEN (kullanıcı bulgusu 16.08, ikinci tur) ─────────────────────────────
 * Arkadaki kart tasarım gereği 30 px aşağıda, %94 ölçekte ve %55 krem tülün altında duruyor
 * (`discoverMetrics`). Öne geçtiğinde bu üçü birden ANİMASYONSUZ sıfırlanıyordu: resim tek karede
 * 30 px yukarı fırlıyor, %6 büyüyor, tülü kalkıyordu. Kullanıcının tarifi: *"anlık resimde bir
 * oynama oluyor sanki"* — yabancı bir resim değil, aynı resmin bir karede yer ve boyut
 * değiştirmesi. İlk turda düzeltilen "kart merkeze geri geliyor" arızasının ARDINDA duran ikinci
 * kusurdu; ikisi birlikte tek bir göz kırpması gibi okunuyordu.
 *
 * `progress` MOUNT ANINDA `depth`e eşitlenir, sonra `withTiming` ile takip eder — yani yeni doğan
 * arka kart animasyonsuz yerinde başlar, öne geçen kart yumuşakça yükselir. Sıralama yarışı YOK:
 * başlangıç değeri prop'tan gelir, paylaşılan bir değere sonradan yazılmaz.
 *
 * **Kart LİSTEDE ve `key={productId}` ile çizilir** (çağıranın sorumluluğu): derinlik değişince
 * React aynı örneği korur. Korumasaydı `<Image>` yeniden bağlanır ve fotoğraf bir kare yeniden
 * yüklenirdi — aynı kırpmanın başka bir kaynağı.
 */
function DeckLayer({
  card,
  depth,
  dragX,
  dragY,
  interactive,
  flyingId,
  exitProgress,
  exitStartX,
  exitStartY,
  exitDirection,
  travel,
  glow,
  stamp,
  testID,
}: DeckLayerProps) {
  const progress = useSharedValue(depth);
  useEffect(() => {
    progress.value = withTiming(depth, { duration: discoverMetrics.exitMs, easing: EXIT_EASING });
  }, [depth, progress]);

  const style = useAnimatedStyle(() => {
    /*
      ── HER PAYLAŞILAN DEĞER KOŞULSUZ OKUNUR ──────────────────────────────────
      Reanimated, worklet'in hangi değerlere ABONE olacağını onu bir kez koşturup OKUDUKLARINA
      bakarak belirler. Okumalar `if (uçuyor)` dalının içinde kalsaydı, kart uçmazken o dal hiç
      girilmez, `exitProgress` hiç okunmaz ve ABONE OLUNMAZDI: uçuş başlayınca stil bir kez
      hesaplanır, sonra ilerleyen `exitProgress` bir daha çalıştırmazdı — kart bırakıldığı yerde
      donup kalırdı. Kitaplığın belgelenmiş davranışı; sessiz olduğu için de en pahalısı.

      Değerler bu yüzden dalların DIŞINDA, en başta okunuyor. Ucuz: hepsi tek sayı.
    */
    const flying = flyingId.value === card.productId;
    const flightProgress = exitProgress.value;
    const startX = exitStartX.value;
    const startY = exitStartY.value;
    const direction = exitDirection.value;
    const depthProgress = progress.value;
    const dx = dragX.value;
    const dy = dragY.value;

    if (flying) {
      const fx = startX + flightProgress * direction * travel;
      return {
        zIndex: 3,
        opacity: 1 - flightProgress,
        transform: [
          { translateX: fx },
          { translateY: startY * discoverMetrics.verticalFollow },
          { scale: 1 },
          {
            rotate: `${startX / discoverMetrics.rotateDivisor + flightProgress * direction * discoverMetrics.exitRotateDeg}deg`,
          },
        ],
      };
    }
    /* Parmak izi derinlikle SÖNER: arka konumdaki kart (p=1) sürüklenmez, öne geldikçe (p→0)
       parmağı tam olarak izler. Böylece promosyon ortasında yakalanan bir jest de zıplatmaz. */
    const lead = interactive ? 1 - depthProgress : 0;
    const x = dx * lead;
    return {
      zIndex: depth === 0 ? 2 : 1,
      opacity: 1,
      transform: [
        { translateX: x },
        { translateY: dy * discoverMetrics.verticalFollow * lead + depthProgress * discoverMetrics.nextDrop },
        { scale: 1 - depthProgress * (1 - discoverMetrics.nextScale) },
        { rotate: `${x / discoverMetrics.rotateDivisor}deg` },
      ],
    };
  });

  /** Krem tül derinlikle gelir gider — kartın öne geçişiyle AYNI eğride çözülür. */
  const veilStyle = useAnimatedStyle(() => ({ opacity: progress.value * discoverMetrics.nextVeilOpacity }));

  return (
    <DeckCard
      card={card}
      style={style}
      glow={glow}
      stamp={stamp}
      veil={<Animated.View style={[styles.nextVeil, veilStyle]} pointerEvents="none" />}
      decorative={depth !== 0}
      testID={testID}
    />
  );
}

interface DeckCardProps {
  card: DiscoverCard;
  /** Kartın hareketi: destedeki için derinlik+parmak stili, uçan için uçuş stili. */
  style: StyleProp<AnimatedStyle<ViewStyle>>;
  /** Gölge halesi katmanı — üstte üç animasyonlu kardeş, uçanda seçilen tek sabit hale. */
  glow: ReactNode;
  /** Rozet(ler) — üstte parmağa bağlı iki tane, uçanda seçilen tek rozet. */
  stamp: ReactNode;
  /** Arkadaki kartın üstündeki krem tül — öne geçerken opaklığı animasyonla çözülür. */
  veil?: ReactNode;
  /** Uçan kopya ekran okuyucudan gizlenir: aynı ürün adı iki kez okunmasın. */
  decorative?: boolean;
  testID: string;
}

/**
 * Kartın GÖVDESİ — üç katmanın da çizdiği tek kaynak (16.08): üstteki, arkadaki ve uçan. Ayrı bir
 * bileşene çıkarılmasının sebebi bu üçlü: aynı yüzeyi ikinci kez elle yazmak, bir gün birinin
 * ötekinden ayrışması demekti (CLAUDE §1). Ayrışan şeyler PROP olarak dışarıda kaldı — hareket,
 * hale, rozet, tül; çünkü üstteki kart parmağı okur, arkadaki ve uçan okumaz.
 *
 * **Kimlik (`key`) çağıranın sorumluluğu ve KRİTİK:** kart derinlik değiştirdiğinde React aynı
 * örneği korumalı, yoksa `<Image>` yeniden bağlanır ve fotoğraf bir kare boyunca yeniden yüklenir.
 */
function DeckCard({ card, style, glow, stamp, veil, decorative = false, testID }: DeckCardProps) {
  const { theme } = useUnistyles();
  return (
    <Animated.View
      style={[styles.card, style]}
      testID={testID}
      pointerEvents={decorative ? 'none' : 'auto'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      {/* Gölge DIŞ katmanlarda, kırpma İÇTE: aynı görünümde `overflow: 'hidden'` gölgeyi de keser. */}
      {glow}
      <View style={styles.cardSurface}>
        <CardPhoto card={card} />
        {/* Fotoğrafın üstündeki yazının okunması için koyu gradyan (v3:416). */}
        <LinearGradient {...theme.gradient.photoBottom} style={styles.cardScrim} pointerEvents="none" />
        {stamp}
        <View style={styles.cardText} pointerEvents="none">
          <Text style={styles.cardName} accessibilityRole={decorative ? 'none' : 'header'}>
            {card.name}
          </Text>
          {card.description === null ? null : <Text style={styles.cardDescription}>{card.description}</Text>}
        </View>
        {veil}
      </View>
    </Animated.View>
  );
}

/**
 * Uçmakta olan kartın künyesi — desteden ÇIKMIŞ, ekrandan henüz çıkmamış kart.
 *
 * Başlangıç yeri (`startX/startY`) DURUMDA taşınır, paylaşılan değerde değil: katman mount olduğu
 * İLK karede parmağın bıraktığı yerde durmak zorunda. Paylaşılan değere yazsaydık o yazım UI
 * thread'e bir kare sonra düşerdi ve kart bir kare merkezde görünürdü — düzeltilen arızanın ta
 * kendisi (künye `DiscoverScreen` gövdesinde).
 */
interface ExitingCard {
  card: DiscoverCard;
  choice: FeedbackVote;
}

interface DiscoverScreenProps {
  /** Girişli mi — puan davetinin ve talep kapısının tek koşulu; rota `useMe` ile çözer. */
  signedIn: boolean;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function DiscoverScreen({ signedIn, locale: forcedLocale }: DiscoverScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const discover = useDiscover(locale, signedIn);
  /* İpucu kutusunun yüksekliği (`styles.hint`): dikey dolgu + İKİ satır yazı — kutu şablonda da
     iki satırlıdır ("Beğenmedim / sola kaydır"). Bekleme dalında kullanılır. */
  const skeletonHintHeight = theme.space.lg * 2 + theme.text.helper * discoverMetrics.hintLineHeight * 2;

  const [index, setIndex] = useState(0);
  /** Bu turda beğenilen aday sayısı — düğmelerin altındaki ve bitiş ekranındaki cümlenin sayısı. */
  const [likes, setLikes] = useState(0);

  /* Kartın çıkacağı yol: şablon %130 diyor ve yüzde KARTIN genişliğinindir (ekranın değil) —
     kart iki yandan 18'er dolgunun içinde durur. */
  const travel = (width - 2 * theme.space['4xl']) * discoverMetrics.exitTravel;

  /** Parmağın yatay/dikey yeri (drag) — YALNIZ üstteki kartı, yalnız o sürüklenirken taşır. */
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  /** Uçan kartın ilerlemesi: 0 bırakıldığı yer, 1 ekrandan tamamen çıkmış. */
  const exitProgress = useSharedValue(0);
  /*
    UÇUŞUN BAŞLANGICI PAYLAŞILAN DEĞERDE, REACT DURUMUNDA DEĞİL (kullanıcı bulgusu 16.08, dördüncü
    tur). Önce `exiting.startX` durumundan okunuyordu ve kullanıcı şunu gördü: *"anlık olarak orta
    noktaya gidiyor, sonra parmağımın olduğu yere geri gelip oradan dışarı gidiyor."*

    Sebep animasyonlu stilin JS KAPANIŞI: `useAnimatedStyle` içindeki `startX` bir React değeri ve
    katman mount olduğu karede worklet hâlâ ESKİ kapanışla (startX = 0) koşuyor — kart bir kare
    merkezde çiziliyor, kapanış yenilenince yerine sıçrıyor. Değerler artık jest bırakılırken
    DOĞRUDAN UI thread'de yazılıyor: worklet'in yeniden bağlanmasını bekleyen hiçbir şey kalmadı.
  */
  const exitStartX = useSharedValue(0);
  const exitStartY = useSharedValue(0);
  const exitDirection = useSharedValue(1);
  /*
    UÇAN KARTIN KİMLİĞİ — ve uçuşun BIRAKMA ANINDA başlamasının anahtarı (kullanıcı bulgusu 16.08,
    altıncı tur). Uçuş önce bir React etkisiyle, yani katman doğduktan SONRA başlıyordu; kullanıcı
    *"kartı kenarda bıraktığım anda birkaç saniye bekliyor, sonra hareket ediyor"* dedi. Beklenen
    şey React'in gidiş-dönüşüydü.

    Artık animasyon jest bırakılırken UI thread'de başlıyor. Hangi kartın uçtuğunu da React değil
    BU DEĞER söylüyor: her katman kendi `cardId`siyle karşılaştırır. Bayrak yerine KİMLİK olması
    şart — bayrak olsaydı, öne geçen yeni kart da onu okur ve o da uçardı.
  */
  const flyingId = useSharedValue<string | null>(null);
  /** Çıkış sürerken ikinci karar YUTULUR (v3 `kGo`nun ilk satırı) — iki kart birden geçmesin. */
  const locked = useSharedValue(0);

  /*
    ── UÇAN KART AYRI KATMAN (kullanıcı bulgusu + kararı 16.08) ────────────────
    Önceki kurgu TEK kart çiziyordu ve çıkış animasyonunun sonunda onu merkeze geri alıyordu:

        exit.value = withTiming(±1, timing, () => {
          exit.value = 0;             // UI thread — kart ANINDA merkeze döner
          runOnJS(advance)(choice);   // JS thread — içerik 1-3 kare SONRA değişir
        });

    Kartın opaklığı `1 - |exit|` olduğu için sıfırlama, kartı TAM OPAKLIKLA ve HÂLÂ ESKİ ÜRÜNLE
    merkeze basıyordu; `setIndex` ancak birkaç kare sonra yetişiyordu. Kullanıcının gördüğü:
    *"beğenme bittiği anda araya bir resim giriyor, sonra arkadan görünen resim yeniden geliyor"* —
    araya giren yabancı bir kart değil, az önce kaydırılan kartın kendisiydi. Sıralama yarışı
    `runOnJS`in TANIMI gereği kaçınılmazdı: UI thread'in sıfırlaması ile JS thread'in içerik
    değişimi aynı kareye hiçbir zaman düşemez.

    Yeni kurgu yarışı ortadan kaldırır, geciktirmez: kaydırılan kart AYRI bir katmana kopyalanır ve
    orada uçar; alttaki deste aynı React commit'inde ilerler. Üstteki kart artık geri alınacak bir
    yere hiç gitmediği için sıfırlanacak bir şey de yok — `exiting` doluyken üst kart parmağı HİÇ
    okumaz, durgun çizilir (aşağıda `cardStyle`). Katman ile içerik tek commit'te değiştiği için
    ikisi arasında kare farkı olamaz.
  */
  const [exiting, setExiting] = useState<ExitingCard | null>(null);

  const cards = discover.cards;
  const card = cards[index] ?? null;
  const nextCard = cards[index + 1] ?? null;
  const hasThirdCard = cards[index + 2] !== undefined;

  /* Kartın ekranda kaldığı süre — `dwellMs` sinyal KALİTESİNİN girdisidir, puanın değil
     (DOMAIN §14): ekran ölçer, motor değerlendirir. Ölçüm kartın göründüğü anda başlar. */
  const shownAt = useRef(Date.now());
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, cards]);

  /**
   * Kart desteden ÇIKAR: uçan katmana kopyalanır, oy kuyruğa girer, deste ilerler. Hepsi TEK React
   * commit'inde — uçan katmanın mount'u ile üstteki kartın içerik değişimi aynı kareye düşsün diye.
   * JS tarafı; jest worklet'inden `runOnJS` ile, düğmeden doğrudan çağrılır.
   */
  const beginExit = useCallback(
    (choice: FeedbackVote) => {
      const current = cards[index];
      if (current === undefined) return;
      setExiting({ card: current, choice });
      /* ÇIKIŞ SÜRESİ ARTIK DÜŞÜLMÜYOR — ve bu bir sadeleştirme değil, düzeltme (16.08). Kural
         aynı: `dwellMs` DÜŞÜNME süresidir, kartın uçtuğu 330 ms ona dahil değil. Değişen şey bu
         satırın KOŞTUĞU AN: eski kurguda burası çıkış animasyonu BİTTİKTEN sonra çalışıyordu, yani
         geçen süre uçuşu da içeriyordu ve `exitMs` geri çıkarılmak zorundaydı. Artık karar anında
         (jest bırakıldığında / düğmeye basıldığında) çalışıyor — uçuş henüz BAŞLAMADI. Çıkarma
         kalsaydı her kaydırma 330 ms EKSİK ölçülür, motorun "hızlı kaydırma" eşiği kayardı. */
      const dwellMs = Math.max(0, Date.now() - shownAt.current);
      /* Yazım DÜŞSE BİLE kart ilerler (web kararı): müşteriyi düzeltemeyeceği bir arızada turun
         ortasında kilitlemeyiz. Düşen yazımın karşılığı hook'ta: o kaydırma sayılmaz. */
      discover.vote({ productId: current.productId, vote: choice, dwellMs });
      setIndex(index + 1);
      if (choice === 'like') setLikes((count) => count + 1);
      /* Tur bitişi tek onay noktası — v3'te toast yok ama akışın sonu sessiz kalmamalı
         (kitin toast katmanı tam bu iş için var). */
      if (index + 1 >= cards.length) publishToast(t.toast);
      /* ── PARMAK İZİ BURADA SİLİNMEZ (kullanıcı bulgusu 16.08, üçüncü tur) ──────
         Siliniyordu ve ölçülen sonuç şuydu (yavaşlatılmış uçuşla görüldü): kullanıcı kartı sağa
         çekip bırakıyor, kart ÖNCE MERKEZE ATLIYOR, uçuş oradan başlıyor. Kullanıcının cümlesi:
         *"parmağımı bıraktığım konumdan hareket etmiyor, orta noktaya geliyor ve oradan gidiyor."*

         Sebep yine iki thread: bu yazım UI thread'e ANINDA düşüyor, ama uçan katmanı doğuran
         `setExiting` bir React commit'i bekliyor. O aradaki 1-2 karede ESKİ kart hâlâ ekranda ve
         hâlâ parmağı okuyor — izi silinince merkeze snap ediyor.

         Silme artık uçuşun BİTİŞİNDE, `exiting` hâlâ doluyken yapılıyor: o anda destedeki kart
         parmağı zaten okumuyor (`interactive` false), yani sıfırlama görünmez. Kod aşağıda,
         `exitProgress`in tamamlanma çağrısında.

         Uçuşun BAŞLANGIÇ değerleri de burada yazılmaz: onları iki giriş kapısı (jest bırakma ·
         düğme) katman doğmadan önce kendi thread'inde yazıyor. Burada tekrarlamak, aynı gerçeği
         iki yere yazmak olurdu. */
    },
    [cards, discover, exitProgress, index, t.toast],
  );

  /** Uçuş bitti: katman sökülür. Kilidi AÇMAZ — onu UI thread'de `clearFlight` açıyor. */
  const finishExit = useCallback(() => {
    setExiting(null);
  }, []);

  /*
    UÇUŞ BIRAKMA ANINDA BAŞLAR — React'in commit'i beklenmez (kullanıcı bulgusu 16.08).
    Animasyon önce `exiting` durumuna bağlı bir etkide kuruluyordu, yani jest bırakıldıktan sonra
    bir JS gidiş-dönüşü geçiyordu: kart bırakıldığı yerde bekliyor, sonra hareket ediyordu
    (kullanıcı: *"bıraktığım yerde birkaç saniye bekliyor"*). Artık iki giriş kapısı da uçuşu kendi
    thread'inde başlatıyor (jest: UI · düğme: JS) ve üstteki kart `flyingId` sayesinde commit'i
    beklemeden yola çıkıyor.

    Kapanış animasyonun KENDİ geri çağrısında: paylaşılan değerler React'ten önce temizlenir, sonra
    katmanı sökecek olan `finishExit` çağrılır.

    ── BU EKRAN SICAK YENİDEN YÜKLEMEYLE DOĞRULANMAZ (ders 16.08) ──────────────
    Metro sıcak yeniden yükleme yaptığında UÇMAKTA olan `withTiming` ölür ama React durumu ayakta
    kalır: `exiting` dolu, `locked` 1. Kilidi açacak olan tamamlanma çağrısı hiç gelmez, yani deste
    KALICI olarak taşlaşır. Bu, saatlerce koda yüklenen bir hayalet arızaydı; kod hiç sebep
    olmamıştı. Kural: bu ekranın her ölçümü uygulama KOMPLE yeniden başlatıldıktan sonra ve EN AZ
    BEŞ ARDIŞIK kaydırmayla yapılır — tek kaydırma kilidi hiçbir zaman göstermez.
  */

  /* Jest de düğme de buradan geçer — iki ayrı yol yazılsaydı biri bir gün ötekinden farklı
     davranırdı (yüzen sayfanın `animateClose` dersi). Düğmede parmak izi yok, o yüzden başlangıç
     noktası sıfır: kart merkezden uçar. */
  const commitFromButton = useCallback(
    (choice: FeedbackVote) => {
      if (locked.value === 1) return;
      locked.value = 1;
      /* Düğmede parmak izi yok: kart merkezden uçar. Jest yolundaki başlatmanın ikizi — orada UI
         thread'de, burada JS'te; ikisi de `clearFlight` ile biter. */
      const flying = cards[index];
      if (flying === undefined) return;
      exitStartX.value = 0;
      exitStartY.value = 0;
      exitDirection.value = choice === 'like' ? 1 : -1;
      exitProgress.value = 0;
      flyingId.value = flying.productId;
      exitProgress.value = withTiming(1, { duration: discoverMetrics.exitMs, easing: EXIT_EASING }, (completed) => {
        if (completed !== true) return;
        clearFlight(flyingId, dragX, dragY, locked);
        runOnJS(finishExit)();
      });
      beginExit(choice);
    },
    [
      beginExit,
      cards,
      dragX,
      dragY,
      exitDirection,
      exitProgress,
      exitStartX,
      exitStartY,
      finishExit,
      flyingId,
      index,
      locked,
    ],
  );

  /* Jestin worklet'i React nesnesi okuyamaz; uçacak kartın kimliği bu yüzden düz bir dizge olarak
     dışarıda çözülür. Değeri her çizimde tazelenir, yani bırakma anında hep güncel karttır. */
  const flyingCardId = card?.productId ?? null;

  const swipe = Gesture.Pan()
    .onUpdate((event) => {
      if (locked.value === 1) return;
      dragX.value = event.translationX;
      dragY.value = event.translationY;
    })
    .onEnd((event) => {
      if (locked.value === 1) return;
      const farEnough = Math.abs(event.translationX) > SWIPE_THRESHOLD;
      const fastEnough = Math.abs(event.velocityX) > SWIPE_VELOCITY;
      if (!farEnough && !fastEnough) {
        dragX.value = withTiming(0, { duration: discoverMetrics.returnMs });
        dragY.value = withTiming(0, { duration: discoverMetrics.returnMs });
        return;
      }
      /* Yön mesafeden okunur; mesafe tam sıfırsa (yerinde fırlatma) hızın işareti karar verir. */
      const forward = event.translationX === 0 ? event.velocityX : event.translationX;
      locked.value = 1;
      /* Uçuş TAM BURADA başlar — değerler de animasyon da UI thread'de. React'e yalnız "oyu yaz,
         desteyi ilerlet" haberi gider; kartın hareketi o habere BAĞLI DEĞİL (künye `flyingId`). */
      exitStartX.value = dragX.value;
      exitStartY.value = dragY.value;
      exitDirection.value = forward > 0 ? 1 : -1;
      exitProgress.value = 0;
      flyingId.value = flyingCardId;
      exitProgress.value = withTiming(1, { duration: discoverMetrics.exitMs, easing: EXIT_EASING }, (completed) => {
        if (completed !== true) return;
        clearFlight(flyingId, dragX, dragY, locked);
        runOnJS(finishExit)();
      });
      /* React'e giden haber SONDA: oyu yaz, desteyi ilerlet. Kartın hareketi bu habere bağlı
         değil — o yukarıda, bu thread'de çoktan başladı. */
      runOnJS(beginExit)(forward > 0 ? 'like' : 'dislike');
    });

  /**
   * DESTENİN KATMANLARI — arkadan öne. Tek liste, `key={productId}`: kart derinlik değiştirdiğinde
   * React aynı örneği korur, yani hem fotoğraf yeniden yüklenmez hem derinlik animasyonla çözülür
   * (`DeckLayer` künyesi). Ayrı JSX yuvalarında dursalardı ikisi de olmazdı.
   */
  const deckLayers = [
    ...(nextCard === null ? [] : [{ card: nextCard, depth: 1 }]),
    ...(card === null ? [] : [{ card, depth: 0 }]),
  ];
  /** Parmağa bağlı süsler (rozet · yön haleleri) çizilsin mi — uçuş sürerken HAYIR. */
  const dragDecor = exiting === null;

  /**
   * Uçan kart: bırakıldığı yerden başlar, seçilen yöne kayar, eğilir ve soluklaşır.
   *
   * Worklet YALNIZ paylaşılan değer okur ve hepsini KOŞULSUZ okur — Reanimated aboneliği
   * okuduklarına bakarak kurar, bir dalın içinde kalan değer hiç izlenmez.
   */
  const exitingStyle = useAnimatedStyle(() => {
    const p = exitProgress.value;
    const startX = exitStartX.value;
    const startY = exitStartY.value;
    const direction = exitDirection.value;
    return {
      opacity: 1 - p,
      transform: [
        { translateX: startX + p * direction * travel },
        { translateY: startY * discoverMetrics.verticalFollow },
        {
          rotate: `${startX / discoverMetrics.rotateDivisor + p * direction * discoverMetrics.exitRotateDeg}deg`,
        },
      ],
    };
  });

  /* Basılı rozetler ve gölge halesi — üçü de AYNI oranı okur (`min(1, |x|/92)`), yani karar
     eşiğine yaklaşan kartın üç işareti birlikte koyulaşır. */
  /*
    PARMAK İZİ UÇUŞ BOYUNCA SUSAR (16.08). `dragX` bırakma anındaki değerini uçuş bitene kadar
    korur — sıfırlamak eski kartı merkeze atlatıyordu (künye `beginExit`te). Ama o değer rozet ve
    haleyi de besliyor, yani öne geçen YENİ kart bir anda "İSTERİM" rozetiyle çiziliyordu.

    ── KAPI `locked`, BİR REACT DEĞERİ DEĞİL (kullanıcı bulgusu 16.08, beşinci tur) ──
    Kapı önce `exiting === null` idi ve kullanıcı şunu gördü: *"merkeze gelen artık resim değil,
    İSTERİM yazısı geliyor."* Sebep, uçuşun başlangıç noktasında düzeltilen hatanın İKİZİ: React
    değeri worklet'in KAPANIŞINDA yaşıyor, katmanın doğduğu karede kapanış hâlâ eski — yani kapı
    bir kare boyunca "açık" kalıyor ve rozet, merkezdeki kartın üstünde parlıyordu.

    `locked` paylaşılan bir değer ve tam bu soruyu cevaplıyor: 1 = uçuş sürüyor. Jest bırakılırken
    UI thread'de yazılır, uçuş bitince yine UI thread'de silinir — arada React'i bekleyen tek bir
    kare yok. Kararı taşıyan rozet zaten uçan kartın üstünde, sabit opaklıkla duruyor.
  */
  const likeStampStyle = useAnimatedStyle(() => ({
    opacity: dragX.value > 0 ? Math.min(1, dragX.value / SWIPE_THRESHOLD) : 0,
  }));
  const passStampStyle = useAnimatedStyle(() => ({
    opacity: dragX.value < 0 ? Math.min(1, -dragX.value / SWIPE_THRESHOLD) : 0,
  }));

  /*
    GÖLGE ÜÇ KATMAN, OPAKLIKLA KARIŞTIRILIR: şablon gölgenin RENGİNİ ve alfasını her karede
    yeniden yazıyor; RN'de `boxShadow` dizgesini kare kare üretmek Reanimated'in native yolunda
    tanımlı DEĞİL (ölçülemedi, o yüzden denenmedi). Aynı sonucu opaklıkla kurmak matematiksel
    olarak birebir: hale en yüksek alfasıyla çizilir, opaklık `istenen/azami` oranına ayarlanır.
  */
  const restGlowStyle = useAnimatedStyle(() => ({ opacity: dragX.value === 0 ? 1 : 0 }));
  const likeGlowStyle = useAnimatedStyle(() => ({
    opacity: dragX.value > 0 ? glowOpacity(Math.min(1, dragX.value / SWIPE_THRESHOLD)) : 0,
  }));
  const passGlowStyle = useAnimatedStyle(() => ({
    opacity: dragX.value < 0 ? glowOpacity(Math.min(1, -dragX.value / SWIPE_THRESHOLD)) : 0,
  }));

  /** "Geri al" — yalnız GERÇEKTEN geri alınabilir bir oy varken etkin (bkz. başlık künyesi). */
  const undo = useCallback(() => {
    const undone = discover.undoLastVote();
    if (undone === null) return;
    setIndex((current) => Math.max(0, current - 1));
    if (undone.vote === 'like') setLikes((count) => Math.max(0, count - 1));
    dragX.value = 0;
    dragY.value = 0;
    /* Uçuş sürerken geri alınabilir (pencere 330 ms'den uzun): katman ANINDA sökülür, yoksa geri
       gelen kartın kopyası ekranda uçmaya devam ederdi. Kilit de burada açılır — animasyonun
       kendi bitiş çağrısı `completed === false` ile gelip hiçbir şey yapmayacak. */
    setExiting(null);
    exitProgress.value = 0;
    locked.value = 0;
  }, [discover, dragX, dragY, exitProgress, locked]);

  const showUndo = discover.status === 'ready' && cards.length > 0;
  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="discover-back" />}
      right={
        !showUndo ? undefined : (
          <PressableSurface
            onPress={undo}
            feedback="scale-small"
            disabled={!discover.canUndo}
            style={styles.undo}
            accessibilityLabel={t.undo}
            compact
            testID="discover-undo"
          >
            <Icon
              name="undo"
              size={theme.size.inlineIcon}
              color={discover.canUndo ? theme.colors.ink : theme.colors['sand-500']}
            />
            <Text style={[styles.undoLabel, discover.canUndo ? undefined : styles.undoLabelIdle]}>{t.undo}</Text>
          </PressableSurface>
        )
      }
      testID="discover-appbar"
    />
  );

  /* İLK YÜK: dönen halka yerine DESTENİN KENDİSİ bekler (kullanıcı kararı 10.08 — halka bir
     YERLEŞİM bekleyen ekranda yer tutmuyordu; deste gelince ekran bir anda doluyor ve ilerleme
     çubuğuyla ipuçları aşağıdan zıplıyordu).

     SKELETON EKRANIN İÇİNDE, ayrı dosyada değil: ölçüleri `discoverMetrics` veriyor ve o blok bu
     dosyada yaşıyor (kendi künyesi: ölçü katmanları bu görevde yazıya kapalı). Ayrı dosya, ya
     dairesel bağımlılık ya 40 satırlık bir taşıma isterdi — kusur zaten gömülülük değil, yanlış
     göstergeydi.

     SABİT YAPI GERÇEK ÇİZİLİR: ilerleme dilimleri, destenin alt iki katmanı ve ipucu kutularının
     kabuğu veriye bağlı değil. Gri kalan yalnız üstteki kart, sayaç ve ipucu yazıları. */
  if (discover.status === 'loading') {
    return (
      <View style={styles.screen} testID="discover-screen">
        {bar}
        <View
          style={styles.body}
          testID="discover-loading"
          accessible
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
        >
          <View style={styles.progressRow}>
            <View style={styles.segments}>
              {SKELETON_SEGMENTS.map((slot) => (
                <View key={slot} style={styles.segment} />
              ))}
            </View>
            <Skeleton width={discoverMetrics.segmentCurrentWidth} height={theme.text.micro} tone="deep" />
          </View>

          <View style={styles.guide}>
            <Skeleton width="62%" height={theme.text.helper * theme.text['h1--line-height']} />
            <View style={styles.hintRow}>
              <Skeleton width="48%" height={skeletonHintHeight} radius="control" />
              <Skeleton width="48%" height={skeletonHintHeight} radius="control" />
            </View>
          </View>

          <View style={styles.deck}>
            {/* Alt iki katman GERÇEK: derinlik hissini veren şey onlar ve ikisi de veriye bağlı
                değil (yalnız yüzey + gölge). Üstteki kart gri — gelecek olan odur. */}
            <View style={styles.thirdCard} pointerEvents="none" />
            <View style={styles.nextCard} pointerEvents="none" />
            <Skeleton
              width="100%"
              height={discoverMetrics.deckHeight - discoverMetrics.deckFootroom}
              radius="card"
              tone="deep"
            />
          </View>
        </View>
      </View>
    );
  }

  if (discover.status === 'error') {
    return (
      <View style={styles.screen} testID="discover-screen">
        {bar}
        {/* `fill`: bu ekranda boş hâl SAYFANIN TAMAMIDIR (liste içi bir boşluk değil), o yüzden
            içerik dikeyde ortalanır — kullanıcı gözlemi 15.08. */}
        <EmptyState
          fill
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={discover.retry} testID="discover-retry" />}
          testID="discover-error"
        />
      </View>
    );
  }

  /* Hiç aday yoksa tur BİTMEDİ, hiç başlamadı (sapma 2). */
  if (cards.length === 0) {
    return (
      <View style={styles.screen} testID="discover-screen">
        {bar}
        <EmptyState
          fill
          title={t.empty.title}
          description={t.empty.body}
          action={
            <PrimaryButton
              label={t.empty.catalog}
              shape="pill"
              onPress={() => router.replace('/catalog')}
              testID="discover-empty-catalog"
            />
          }
          testID="discover-empty"
        />
      </View>
    );
  }

  if (card === null) {
    /* ── Bitiş: ✦ · teşekkür · beğeni sayısı · puan çipi · giriş daveti · katalog (v3:435-444) ── */
    return (
      <View style={styles.screen} testID="discover-screen">
        {bar}
        {/* Bitiş bloğu KAYDIRILABİLİR: v3'ün 80'lik dikey nefesi + çip + giriş daveti küçük
            telefonda ekranı taşırıyor; kaydırma payı olmasa "Kataloğa dön" erişilemez kalırdı. */}
        <ScrollView contentContainerStyle={styles.done} testID="discover-done">
          {/* ÜST PAY — bloğu optik merkeze çeker (kullanıcı bulgusu 16.08). Kap `justifyContent:
              'center'` ile ORTALIYORDU ve hesabı doğruydu, ama göz sayfaya bakıyor: başlık
              çubuğunun yüksekliği bloğu yarısı kadar aşağı itiyordu. Kural `EmptyState` ve geri
              bildirim sonucuyla AYNI, tek yerde yazılı (`design/KARARLAR.md`): kalan boşluk **4:6**
              — üstte %40, altta %60; oran başlık boyuna göre kendini ayarlar. */}
          <View style={styles.spacerTop} />
          <View style={styles.doneBlock}>
          {/* KAHRAMAN İŞARET, geri bildirim sonucununkiyle AYNI (kullanıcı isteği 15.08 — "her puan
              kazanma durumunun sonucunda aynı sayfa"). Eskiden solgun zeytin bir DAİRE içinde metin
              `✦` vardı; daire aynı gerekçeyle orada da kaldırıldı (15.08): düşük karşıtlıklı büyük
              daire şekil değil leke gibi okunuyor ve içindeki işareti boş bir halkanın ortasında
              bırakıyor. Artık tek, çizili bir geometri var. */}
          <PointsSpark size={discoverMetrics.thanksMark} color={theme.colors.terracotta} />
          <Text style={styles.doneTitle} accessibilityRole="header">
            {t.done.title}
          </Text>
          <Text style={styles.doneLikes} testID="discover-done-likes">
            {likesLabel(t, likes)}
          </Text>
          <Text style={styles.doneBody}>{t.done.body}</Text>

          {/* ÇİP ÜÇ HÂLLİ, ve orta hâl MB-16'nın kendisidir (ölçüldü 11.08: 4 oy → deftere 8 puan,
              ekran "+6"). Turun son oyu bitiş ekranı çizildiğinde hâlâ geri alma penceresinde
              bekliyor; o oy sunucuya gitmeden toplam TAM DEĞİL. Kuyruğu burada zorla boşaltmak
              çare olamazdı — "Geri al" bu ekranda da duruyor ve boşaltma onu yalana çevirirdi.
              Yolda oy varken sayı YAZILMAZ, bekleme SÖYLENİR (aynı çip, aynı biçim).

              Bekleme cümlesi yalnız GİRİŞLİ müşteriye: girişsiz turun ödülü sahipsizdir, ona
              "puanların hesaplanıyor" demek olmayan bir ödülü vaat etmek olurdu (o hâlde altta
              zaten giriş daveti var). Oturmuş toplamda `null` = ödülün sahibi yok · `0` = motor
              gerçekten yazmadı (günlük tavan · B2B · ikinci oy); ikisinde de blok çizilmez.

              BİÇİM ARTIK KİTİN (kullanıcı isteği 15.08): burada tek satırlık bir hap çip vardı ve
              TOPLAMI HİÇ SÖYLEMİYORDU — geri bildirim sonucu ise üç satır yazıyordu. Aynı sistemin
              iki ödülü iki ayrı biçimle anlatılıyordu; ortak blok o ikiliği kapatıyor
              (`customer-kit/points-award.tsx`). Üç hâlin kapısı da oraya taşındı, burada kalan
              yalnız "bekliyor muyuz" sorusu. */}
          <PointsAward
            points={discover.awardedPoints}
            balance={discover.balance}
            settling={signedIn && discover.pointsSettling}
            testID="discover-award"
          />

          {/*
            GİRİŞ DAVETİ, `signedIn`e DEĞİL "turun sahibi var mı"ya bakar (MB-14, 14.08).

            **Ölçülen çelişki (11.08):** ekran aynı anda hem *"+6 puan kazandınız"* hem *"Giriş
            yaparsanız…"* diyordu. Sebep bulundu ve tek cümlelik: **"giriş yaptım mı" sorusunun
            uygulamada İKİ AYRI KAYNAĞI var.** Ekran `useMe`nin `signedIn`ini okuyor; ağ katmanı
            ise Supabase'e kendisi soruyor (`maybeAuthorizedFetch` → `auth.getSession()`). İkisi
            ayrıştığı an — jeton hâlâ geçerliyken arayüzün misafire düşmesi, yani MB-13'ün
            belirtisi — sunucu oyu müşterinin üstüne yazıp puanı döndürüyor, ekran ise davet
            gösteriyor. Yani çelişki bir çizim hatası değil, iki doğruluk kaynağının sonucu.

            **Çare, davetin KENDİ ölçütünü kullanması.** Davetin söylediği şey *"bu turun sahibi
            yok, giriş yaparsan sana yazılır"*dır. Bunun gerçek kanıtı `signedIn` değil, ödülün
            yazılıp yazılmadığıdır: sunucu kimliksiz oya puan YAZMIYOR ve `pointsAwarded: null`
            dönüyor (`application/feedback/discover.ts:158`). Yani `awardedPoints` bir sayıysa
            turun sahibi VARDIR — ekran ne sanıyorsa sansın, davet o hâlde yanlıştır.

            MB-13'ü bu KAPATMAZ (iki kaynak hâlâ ayrışabilir) ama yalanı kapatır: bir daha aynı
            karede hem ödül hem davet görünmez.
          */}
          {signedIn || discover.awardedPoints !== null ? null : (
            <>
              <Text style={styles.loginHint}>{t.done.loginHint}</Text>
              <SecondaryButton
                label={t.done.loginCta}
                tone="olive"
                shape="pill"
                onPress={() => router.push('/login')}
                testID="discover-login"
              />
            </>
          )}

          <View style={styles.catalogSlot}>
            <PrimaryButton
              label={t.done.catalog}
              shape="pill"
              onPress={() => router.replace('/catalog')}
              testID="discover-catalog"
            />
          </View>
          </View>
          <View style={styles.spacerBottom} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="discover-screen">
      {bar}
      <View style={styles.body}>
        {/* ── Dilimli ilerleme (v3:383-389): geçilen · güncel · gelecek + "3 / 20" ── */}
        <View style={styles.progressRow}>
          <View style={styles.segments} testID="discover-segments">
            {cards.map((deckCard, position) => (
              <View
                key={deckCard.productId}
                style={[
                  styles.segment,
                  position < index ? styles.segmentDone : undefined,
                  position === index ? styles.segmentCurrent : undefined,
                ]}
              />
            ))}
          </View>
          <Text style={styles.progress} testID="discover-progress">
            {t.progress
              .replace('{current}', String(Math.min(index + 1, cards.length)))
              .replace('{total}', String(cards.length))}
          </Text>
        </View>

        {/* ── Çerçeveleme cümlesi + yön ipuçları (v3:390-400) ── */}
        <View style={styles.guide}>
          <Text style={styles.framing}>{t.framing}</Text>
          <View style={styles.hintRow}>
            <View style={[styles.hint, styles.hintPass]}>
              <Icon name="arrow-left" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
              <Text style={styles.hintPassTitle}>
                {t.hint.passTitle}
                {'\n'}
                <Text style={styles.hintPassBody}>{t.hint.passBody}</Text>
              </Text>
            </View>
            <View style={[styles.hint, styles.hintLike]}>
              <Text style={styles.hintLikeTitle}>
                {t.hint.likeTitle}
                {'\n'}
                <Text style={styles.hintLikeBody}>{t.hint.likeBody}</Text>
              </Text>
              <Icon name="arrow-right" size={theme.size.inlineIcon} color={theme.colors['olive-dark']} />
            </View>
          </View>
        </View>

        <GestureDetector gesture={swipe}>
          <View style={styles.deck}>
            {/* Üçüncü kart yalnız DERİNLİK: fotoğrafı bile yok, kum bir yüzey (v3:406). Desteye
                GİRMEZ — kimliği olmayan bir süstür, öne geçen bir kartı temsil etmez. */}
            {!hasThirdCard ? null : <View style={styles.thirdCard} pointerEvents="none" testID="discover-third" />}

            {/* ÜSTTEKİ VE ARKADAKİ KART TEK LİSTEDE, `key={productId}` ile (16.08). Ayrı JSX
                yuvalarında dursalardı React onları FARKLI öğe sayardı: arkadaki kart öne geçerken
                yeniden bağlanır, fotoğrafı yeniden yüklenir ve derinliği animasyonla çözülemezdi.
                Sıra ARKADAN ÖNE; üst üste binme yine de `zIndex`ten okunur (liste yeniden
                sıralandığında görsel sıra yerinden oynamasın). */}
            {deckLayers.map((layer) => (
              <DeckLayer
                key={layer.card.productId}
                card={layer.card}
                depth={layer.depth}
                dragX={dragX}
                dragY={dragY}
                flyingId={flyingId}
                exitProgress={exitProgress}
                exitStartX={exitStartX}
                exitStartY={exitStartY}
                exitDirection={exitDirection}
                travel={travel}
                interactive={layer.depth === 0 && exiting === null}
                testID={layer.depth === 0 ? 'discover-card' : 'discover-next'}
                glow={
                  /* Hale YALNIZ üstteki kartta: üç kardeş katman, hangisinin görüneceğini
                        opaklık söyler. Arkadaki kart tasarımda halesizdir. */
                  layer.depth !== 0 ? null : !dragDecor ? (
                    // Uçuş sürerken hale SABİT durgun: parmak izi hâlâ dolu olduğu için animasyonlu
                    // hâli okusaydı öne geçen kart gölgesiz kalırdı.
                    <View style={[styles.glow, styles.glowRest]} pointerEvents="none" />
                  ) : (
                    <>
                      <Animated.View style={[styles.glow, styles.glowRest, restGlowStyle]} pointerEvents="none" />
                      <Animated.View style={[styles.glow, styles.glowLike, likeGlowStyle]} pointerEvents="none" />
                      <Animated.View style={[styles.glow, styles.glowPass, passGlowStyle]} pointerEvents="none" />
                    </>
                  )
                }
                stamp={
                  /* ROZET, UÇUŞ SÜRERKEN ÖNDEKİ KARTTA ÇİZİLMEZ (kullanıcı bulgusu 16.08).
                     `dragX` bırakma değerini uçuş boyunca koruyor (kartın merkeze atlamaması için),
                     ama o değer rozeti de besliyor — öne geçen YENİ kart "İSTERİM" damgasıyla
                     çiziliyordu. Kapı worklet'te DEĞİL burada: React commit'iyle uygulanınca
                     arada bir kare kalmıyor. Uçan kartın kendi rozeti aşağıda, sabit opaklıkta. */
                  layer.depth !== 0 || !dragDecor ? null : (
                    <>
                      <Animated.View
                        style={[styles.stamp, styles.stampLike, likeStampStyle]}
                        pointerEvents="none"
                        testID="discover-stamp-like"
                      >
                        <Text style={[styles.stampLabel, styles.stampLikeLabel]}>{t.stamp.like}</Text>
                      </Animated.View>
                      <Animated.View
                        style={[styles.stamp, styles.stampPass, passStampStyle]}
                        pointerEvents="none"
                        testID="discover-stamp-pass"
                      >
                        <Text style={[styles.stampLabel, styles.stampPassLabel]}>{t.stamp.pass}</Text>
                      </Animated.View>
                    </>
                  )
                }
              />
            ))}

            {/* UÇAN KART — desteden çıkmış KOPYA, kendi katmanında ve hepsinin ÜSTÜNDE.
                Kopya, çünkü deste `key={productId}` ile çiziliyor: aynı kartı desteden uçan
                katmana TAŞIMAK, React'in o elemanı sökülmüş sayması demek. Fotoğraf yeniden
                bağlanır ve tam uçuşun başında bir kare boşluk doğar. Kopya bir `<Image>` daha
                yaratıyor ama görsel önbellekte, bedeli yok.
                Rozeti ve halesi SABİT: kart eşiği geçtiği için uçuyor, kararı zaten belli. */}
            {exiting === null ? null : (
              <DeckCard
                card={exiting.card}
                style={[styles.exitingLayer, exitingStyle]}
                decorative
                testID="discover-card-exiting"
                glow={
                  <View
                    style={[styles.glow, exiting.choice === 'like' ? styles.glowLike : styles.glowPass]}
                    pointerEvents="none"
                  />
                }
                stamp={
                  <View
                    style={[styles.stamp, exiting.choice === 'like' ? styles.stampLike : styles.stampPass]}
                    pointerEvents="none"
                  >
                    <Text
                      style={[
                        styles.stampLabel,
                        exiting.choice === 'like' ? styles.stampLikeLabel : styles.stampPassLabel,
                      ]}
                    >
                      {exiting.choice === 'like' ? t.stamp.like : t.stamp.pass}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </GestureDetector>

        {/* ── İki oy düğmesi (v3:428-431): geç (beyaz, kum çerçeveli) · beğen (zeytin dolgulu) ── */}
        <View style={styles.voteRow}>
          <PressableSurface
            onPress={() => commitFromButton('dislike')}
            feedback="scale-small"
            style={[styles.voteButton, styles.passButton]}
            accessibilityLabel={t.vote.pass}
            testID="discover-pass"
          >
            <Icon name="close" size={discoverMetrics.passIcon} color={theme.colors.terracotta} />
          </PressableSurface>
          <PressableSurface
            onPress={() => commitFromButton('like')}
            feedback="scale-small"
            style={[styles.voteButton, styles.likeButton]}
            accessibilityLabel={t.vote.like}
            testID="discover-like"
          >
            <HeartIcon size={discoverMetrics.likeIcon} color={theme.colors.card} />
          </PressableSurface>
        </View>
        <Text style={styles.likes} testID="discover-likes">
          {likesLabel(t, likes)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  /** "Geri al" — ikon + etiket, başlık çubuğunun sağ yuvası (v3:375-378). */
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  undoLabel: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.helper,
    color: theme.colors.ink,
  },
  /** Geri alınacak bir şey kalmadığında soluklaşır (v3 `undoCol`; şablon #c9c0a6 → `sand-500`). */
  undoLabelIdle: {
    color: theme.colors['sand-500'],
  },
  /** Yükleme — deste alanının yerini alır, ekranın dikey ortası (sapma 3). */
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Gövde: v3:381 `padding:12px 18px 0` + `gap:12`. */
  body: {
    flex: 1,
    paddingTop: theme.space.xl,
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.xl,
  },

  /* ── İlerleme çubuğu (v3:383-389) ── */
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  segments: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.space.xs,
  },
  /* Dilimler ŞABLONUN ölçüsünde (10/22) ama BÜZÜLEBİLİR: deste 20 karta kadar çıkabiliyor
     (`DECK_SIZE`) ve dar telefonda sabit genişlikler satırı taşırıyordu. Büzülme genişlikle
     orantılıdır, yani güncel dilim her hâlde ötekilerin iki katı görünür. */
  segment: {
    width: discoverMetrics.segmentWidth,
    flexShrink: 1,
    height: discoverMetrics.segmentHeight,
    borderRadius: discoverMetrics.segmentRadius,
    backgroundColor: theme.colors['sand-300'],
  },
  segmentDone: {
    backgroundColor: theme.colors.olive,
  },
  segmentCurrent: {
    width: discoverMetrics.segmentCurrentWidth,
    backgroundColor: theme.colors.terracotta,
  },
  progress: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },

  /* ── Çerçeveleme + yön ipuçları (v3:390-400) ── */
  guide: {
    alignItems: 'center',
    gap: theme.space.md,
  },
  framing: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    gap: theme.space.md,
  },
  hint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.soft,
  },
  hintPass: {
    backgroundColor: theme.colors['terracotta-bg'],
  },
  hintLike: {
    justifyContent: 'flex-end',
    backgroundColor: theme.colors['olive-bg'],
  },
  hintPassTitle: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * discoverMetrics.hintLineHeight,
    color: theme.colors.terracotta,
  },
  /* İkinci satır ailenin AÇIK tonunda (#a97a55 / #6f8a44). Zeytin tarafın karşılığı token
     setinde var (`olive`), terracotta tarafın YOK — en yakın durak `muted` alındı ve hiyerarşi
     korundu (başlık koyu+kalın, alt satır açık+normal). Eksik token raporlandı. */
  hintPassBody: {
    fontFamily: theme.font.body[400],
    color: theme.colors.muted,
  },
  hintLikeTitle: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * discoverMetrics.hintLineHeight,
    color: theme.colors['olive-dark'],
    textAlign: 'right',
  },
  hintLikeBody: {
    fontFamily: theme.font.body[400],
    color: theme.colors.olive,
  },

  /* ── Deste: sabit 486 yerine ESNEK + tavan (sapma 1) ── */
  deck: {
    flex: 1,
    maxHeight: discoverMetrics.deckHeight,
  },
  /** Üç kartın da AYNI kutusu: alttan 34 pay bırakır (v3:404-414). */
  thirdCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: discoverMetrics.deckFootroom,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors['sand-100'],
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-300'],
    transform: [{ translateY: discoverMetrics.thirdDrop }, { scale: discoverMetrics.thirdScale }],
  },
  nextCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: discoverMetrics.deckFootroom,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors['sand-100'],
    boxShadow: theme.shadow.soft,
    transform: [{ translateY: discoverMetrics.nextDrop }, { scale: discoverMetrics.nextScale }],
  },
  /* Krem tül — şablon `rgba(243,239,226,.55)` diyor; renk `sand-50`in ta kendisi, saydamlığı
     opaklıkla kuruluyor (kremin %55'lik durağı token setinde yok, `cream-glass` .90/.96). */
  nextVeil: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['sand-50'],
    opacity: discoverMetrics.nextVeilOpacity,
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: discoverMetrics.deckFootroom,
  },
  /** Uçan kartın katmanı — destedeki en üst karttan (2) da yukarıda. */
  exitingLayer: {
    zIndex: 3,
  },
  /** Halelerin ortak kutusu — kartla birebir; yalnız gölge çizerler, yüzeyleri yoktur. */
  glow: {
    position: 'absolute',
    inset: 0,
    borderRadius: theme.radius.card,
  },
  glowRest: {
    boxShadow: `0 ${discoverMetrics.glowOffsetY}px ${discoverMetrics.glowBlur}px ${withAlpha(theme.colors.ink, discoverMetrics.glowAlpha)}`,
  },
  glowLike: {
    boxShadow: `0 ${discoverMetrics.glowOffsetY}px ${discoverMetrics.dragGlowBlur}px ${withAlpha(theme.colors.olive, discoverMetrics.dragGlowMaxAlpha)}`,
  },
  glowPass: {
    boxShadow: `0 ${discoverMetrics.glowOffsetY}px ${discoverMetrics.dragGlowBlur}px ${withAlpha(theme.colors.terracotta, discoverMetrics.dragGlowMaxAlpha)}`,
  },
  cardSurface: {
    flex: 1,
    backgroundColor: theme.colors['sand-100'],
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  cardScrim: {
    position: 'absolute',
    inset: 0,
  },
  photoImage: {
    position: 'absolute',
    inset: 0,
  },
  photoFallback: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  photoInitial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors['on-image-soft'],
  },
  /* Basılı rozet (v3:418-419) — şablon 22 px yazıyor, kitin en yakın kademesi 20 (`h2-sm`);
     çerçevesi 3 px, en yakın durak `ring` (2,5). İkisi de raporlandı. */
  stamp: {
    position: 'absolute',
    top: theme.space['6xl'],
    borderWidth: theme.border.ring,
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space['3xl'],
    backgroundColor: theme.colors['cream-glass'],
  },
  stampLike: {
    left: theme.space['4xl'],
    borderColor: theme.colors.olive,
    transform: [{ rotate: `-${discoverMetrics.stampRotateDeg}deg` }],
  },
  stampPass: {
    right: theme.space['4xl'],
    borderColor: theme.colors.terracotta,
    transform: [{ rotate: `${discoverMetrics.stampRotateDeg}deg` }],
  },
  stampLabel: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text['h2-sm'],
    letterSpacing: emToDp(theme.text['badge--letter-spacing'], theme.text['h2-sm']),
    textTransform: 'uppercase',
  },
  stampLikeLabel: {
    color: theme.colors.olive,
  },
  stampPassLabel: {
    color: theme.colors.terracotta,
  },
  /* Künye artık fotoğrafın ÜSTÜNDE (v3:420-424). */
  cardText: {
    position: 'absolute',
    left: theme.space['5xl'],
    right: theme.space['5xl'],
    bottom: theme.space['5xl'],
    gap: theme.space.md,
  },
  cardName: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * discoverMetrics.cardNameLineHeight,
    color: theme.colors['on-image'],
  },
  cardDescription: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors['on-image-soft'],
  },

  /* ── Oy sırası (v3:428) — ortalanmış, 24 aralık (kitin durağı 26) ── */
  voteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space['7xl'],
    paddingTop: theme.space['2xs'],
  },
  voteButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  passButton: {
    width: discoverMetrics.passButton,
    height: discoverMetrics.passButton,
    borderRadius: discoverMetrics.passButton / 2,
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.ring,
    borderColor: theme.colors['sand-300'],
    boxShadow: theme.shadow.soft,
  },
  likeButton: {
    width: discoverMetrics.likeButton,
    height: discoverMetrics.likeButton,
    borderRadius: discoverMetrics.likeButton / 2,
    backgroundColor: theme.colors.olive,
    boxShadow: `0 ${discoverMetrics.likeGlowOffsetY}px ${discoverMetrics.likeGlowBlur}px ${withAlpha(theme.colors.olive, discoverMetrics.likeGlowAlpha)}`,
  },
  /* Beğeni sayacı (v3:432). Alt güvenli alan dolgunun İÇİNDE — ikisinin büyüğü alınır, toplanmaz. */
  likes: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors['sand-600'],
    textAlign: 'center',
    paddingBottom: Math.max(rt.insets.bottom, theme.space['4xl']),
  },

  /* ── Bitiş hâli (v3:435-444) — geri bildirim ekranının teşekkür bloğuyla aynı kalıp ── */
  done: {
    /* İÇERİK OPTİK MERKEZDE — puan kazanma anının DESENİ, bu ekranın tercihi değil (kullanıcı
       kararı 15.08: *"biz puan verdiğimiz zaman ekran ortalanıyor… bu bir tasarım desenidir"*).
       Yerleşim `spacerTop`/`spacerBottom` ile 4:6 (16.08 düzeltmesi — künye orada); kap yalnız
       kalan yüksekliği alır. `flexGrow` kaydırmayı BOZMAZ: içerik ekrandan uzunsa kap büyür. */
    flexGrow: 1,
    paddingTop: theme.space['9xl'],
    /* Alt güvenli alan kaydırma payına EKLENİR (bloğun kendi nefesi 70): kaydırılabilir içerikte
       inset dolgunun içinde yaşar, yoksa son düğme çubuğun altında kalır. */
    paddingBottom: rt.insets.bottom + theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
  },
  /** Bitiş içeriğinin kendisi — hizalama ve aralık burada, yerleşim paylarda. */
  doneBlock: {
    alignItems: 'center',
    gap: theme.space['2xl'],
  },
  /* 4:6 — `EmptyState` ve geri bildirim sonucuyla AYNI oran (`design/KARARLAR.md`). */
  spacerTop: { flex: 4 },
  spacerBottom: { flex: 6 },
  doneTitle: {
    fontFamily: theme.font.display[theme.text['card-title--font-weight']],
    fontSize: theme.text['card-title'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  /** Bitişteki beğeni cümlesi (v3:439) — düğme altındakiyle aynı metin, koyu zeytin ve kalın. */
  doneLikes: {
    fontFamily: theme.font.body[700],
    fontSize: theme.text.note,
    color: theme.colors['olive-dark'],
    textAlign: 'center',
  },
  doneBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
    textAlign: 'center',
  },
  loginHint: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
  catalogSlot: {
    marginTop: theme.space.sm,
  },
}));
