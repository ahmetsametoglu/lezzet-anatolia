import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { DiscoverCard, FeedbackVote } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { FrameImage } from '@lezzet/mobile-kit/src/components/ui/frame-image';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { hapticCommit, hapticSelect } from '@lezzet/mobile-kit/src/lib/haptics/haptics';
import { toastInfo } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { PointsAward, PointsSpark } from '@/screens/customer-kit/points-award';
import { HeartIcon } from '@/screens/feedback/feedback-icons';
import { emToDp, withAlpha } from '@lezzet/mobile-kit/src/theme/parse';
import messages from './messages.json';
import { useDiscover } from './use-discover.hook';

/*
  Keşif turu: aday ürünler kart kart gösterilir, müşteri beğenir ya da geçer, deste bitince teşekkür ve puan. "Geri al" oyu
  sunucudan silmez, çünkü öyle bir uç yok; kaydırma geri alma penceresi dolana kadar yazılmaz (`use-discover.hook`).
*/

type Messages = LocalizedCopy<typeof messages>;

/** Bekleme dalının ilerleme dilimleri — destenin tipik uzunluğu (uç 10 kart veriyor). */
const SKELETON_SEGMENTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/* Ekrana özel ölçüler tek yerde; tasarımın ölçüleridir ve ham değerler stillere dağıtılmaz. */
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
  /** Kart adının satır yüksekliği. */
  cardNameLineHeight: 1.08,
  /** Oy düğmeleri (v3:429-430 — 60 ve 72) ve ikonları (24 · 30). */
  passButton: 60,
  passIcon: 24,
  likeButton: 72,
  likeIcon: 30,
  /** Bitiş işaretinin boyu; çevresindeki boşluk bu ölçüye göre kurulu. */
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
 * Halenin opaklığı: hale en yüksek alfasıyla çizilir, istenen alfa "istenen/azami" oranıyla elde edilir. Worklet modül
 * düzeyinde durur ki her karede yeniden kurulmasın.
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
  return <FrameImage image={card.image} style={styles.photoImage} />;
}

/**
 * Uçuşun UI thread kapanışı, jest ve düğme yolunun ortak sonu; modül düzeyinde durur ki kimliği sabit kalsın. Parmak izi ve
 * kilit React'ten önce temizlenir, öne geçen kart ne eski izi okur ne kilidi açık görür.
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
  /** Uçan kartın kimliği; bayrak değil kimlik, çünkü bayrak olsaydı öne geçen kart da onu okur ve o da uçardı. */
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
 * Destedeki bir kart; derinliği değişince oraya animasyonla gider, yoksa öne geçen kart tek karede zıplardı. Çağıran
 * `key={productId}` vermeli ki React aynı örneği korusun ve fotoğraf yeniden yüklenmesin.
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
    /* Paylaşılan değerler koşulsuz, en başta okunur: Reanimated aboneliği okunanlara bakarak kurar ve dalın içinde kalan değer
       izlenmezse uçan kart bırakıldığı yerde donar. */
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
 * Kartın gövdesi, üstteki, arkadaki ve uçan kartın tek kaynağı; ayrışan şeyler (hareket, hale, rozet, tül) prop olarak dışarıda.
 * Çağıran `key` vermeli ki derinlik değişince fotoğraf yeniden yüklenmesin.
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

/** Desteden çıkmış, ekrandan henüz çıkmamış kart. */
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
  /* Uçuşun başlangıcı paylaşılan değerde: React durumunda olsaydı katman doğduğu karede worklet eski değeri okur ve kart bir
     kare merkezde çizilirdi. */
  const exitStartX = useSharedValue(0);
  const exitStartY = useSharedValue(0);
  const exitDirection = useSharedValue(1);
  /* Uçan kartın kimliği; uçuş jest bırakılırken UI thread'de başlar, her katman kendini bu kimlikle karşılaştırır. */
  const flyingId = useSharedValue<string | null>(null);
  /** Çıkış sürerken ikinci karar YUTULUR (v3 `kGo`nun ilk satırı) — iki kart birden geçmesin. */
  const locked = useSharedValue(0);

  /* Uçan kart ayrı katmanda: tek kart çizilip sonunda merkeze alınsaydı UI thread'in sıfırlaması ile JS'in içerik değişimi aynı
     kareye düşmez, kaydırılan kart bir an merkezde görünürdü. */
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

  /** Kart desteden çıkar: uçan katmana kopyalanır, oy kuyruğa girer, deste ilerler; hepsi tek commit'te. */
  const beginExit = useCallback(
    (choice: FeedbackVote) => {
      const current = cards[index];
      if (current === undefined) return;
      /* Titreşim tek yerde, çünkü jest de düğme de buradan geçer. Tur bitişinin toast'ı sessiz: son kararın titreşimine ikinci
         bir cevap eklemezdi. */
      hapticCommit();
      setExiting({ card: current, choice });
      /* Süre karar anında ölçülür, uçuş henüz başlamadı: `dwellMs` düşünme süresidir ve 330 ms'lik uçuşu içermemeli. */
      const dwellMs = Math.max(0, Date.now() - shownAt.current);
      /* Yazım DÜŞSE BİLE kart ilerler (web kararı): müşteriyi düzeltemeyeceği bir arızada turun
         ortasında kilitlemeyiz. Düşen yazımın karşılığı hook'ta: o kaydırma sayılmaz. */
      discover.vote({ productId: current.productId, vote: choice, dwellMs });
      setIndex(index + 1);
      if (choice === 'like') setLikes((count) => count + 1);
      /* Tur bitişi tek onay noktası — v3'te toast yok ama akışın sonu sessiz kalmamalı
         (kitin toast katmanı tam bu iş için var). */
      if (index + 1 >= cards.length) toastInfo(t.toast);
      /* Parmak izi burada silinmez: uçan katman bir React commit'i bekler ve arada eski kart izi silinmiş görüp merkeze
         atlardı. İz uçuşun bitişinde temizlenir. */
    },
    [cards, discover, exitProgress, index, t.toast],
  );

  /** Uçuş bitti: katman sökülür. Kilidi AÇMAZ — onu UI thread'de `clearFlight` açıyor. */
  const finishExit = useCallback(() => {
    setExiting(null);
  }, []);

  /* Uçuş bırakma anında, kendi thread'inde başlar (jest: UI · düğme: JS); React commit'i beklenseydi kart bırakıldığı yerde
     beklerdi. Sıcak yeniden yükleme uçan animasyonu öldürüp kilidi açık bırakmaz, bu ekran tam yeniden başlatmayla ölçülür. */

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

  /** Destenin katmanları arkadan öne, tek listede ve `key={productId}` ile: derinlik animasyonla çözülür, fotoğraf yüklenmez. */
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
  /* Rozet ve hale kapısı `locked` paylaşılan değeri: React değeri worklet'in kapanışında bir kare eski kalır ve öne geçen kart
     bir an "İSTERİM" rozetiyle çizilirdi. */
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
    /* Geri alma HAFİF dokunur: karar değil, kararın iptali — ve pencere içinde ücretsiz. Kararla
       aynı şiddette titreseydi, ikisi birbirinden ayırt edilemezdi. */
    hapticSelect();
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

  /* İlk yükte deste kendisi bekler; dönen halka yerleşimi tutmaz ve deste gelince ekran zıplardı. Veriye bağlı olmayan yapı
     gerçek çizilir, gri kalan yalnız üstteki kart, sayaç ve ipucu yazıları. */
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
        {/* `fill`: bu ekranda boş hâl sayfanın tamamıdır, içerik dikeyde ortalanır. */}
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
          {/* Üst ve alt pay 4:6: blok optik merkeze çekilir, başlık çubuğu onu aşağı itmez. */}
          <View style={styles.spacerTop} />
          <View style={styles.doneBlock}>
          {/* Geri bildirim sonucunun aynı işareti: her puan kazanma anı aynı sonucu çizer. */}
          <PointsSpark size={discoverMetrics.thanksMark} color={theme.colors.terracotta} />
          <Text style={styles.doneTitle} accessibilityRole="header">
            {t.done.title}
          </Text>
          <Text style={styles.doneLikes} testID="discover-done-likes">
            {likesLabel(t, likes)}
          </Text>
          <Text style={styles.doneBody}>{t.done.body}</Text>

          {/* Yolda oy varken toplam tam değil: son oy hâlâ geri alma penceresinde olabilir, sayı yerine bekleme söylenir. Bekleme
              yalnız girişliye, girişsiz turun ödülü sahipsizdir. */}
          <PointsAward
            points={discover.awardedPoints}
            balance={discover.balance}
            settling={signedIn && discover.pointsSettling}
            testID="discover-award"
          />

          {/* Giriş daveti "turun sahibi var mı"ya bakar: ödül yazıldıysa sahibi vardır, arayüz misafire düşmüş olsa bile davet
              yanlış olurdu. */}
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

            {/* Üstteki ve arkadaki kart tek listede, `key={productId}` ile; ayrı yuvalarda olsalar öne geçerken yeniden bağlanırlardı. */}
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
                  /* Uçuş sürerken öndeki kartta rozet çizilmez: parmak izi uçuş boyunca korunur ve yeni kartı damgalardı. */
                  layer.depth !== 0 || !dragDecor ? null : (
                    <>
                      <Animated.View
                        style={[styles.stamp, styles.stampLike, likeStampStyle]}
                        pointerEvents="none"
                        testID="discover-stamp-like"
                      >
                        {/* Damga dilin kuralıyla büyür (`upperIn`), çünkü `textTransform` Android'de cihazın dilini kullanır. */}
                        <Text style={[styles.stampLabel, styles.stampLikeLabel]}>{upperIn(t.stamp.like, locale)}</Text>
                      </Animated.View>
                      <Animated.View
                        style={[styles.stamp, styles.stampPass, passStampStyle]}
                        pointerEvents="none"
                        testID="discover-stamp-pass"
                      >
                        <Text style={[styles.stampLabel, styles.stampPassLabel]}>{upperIn(t.stamp.pass, locale)}</Text>
                      </Animated.View>
                    </>
                  )
                }
              />
            ))}

            {/* Uçan kart desteden bir kopya: aynı kartı taşımak React'e onu sökülmüş saydırır ve uçuşun başında bir kare boşluk
                doğardı. Rozeti ve halesi sabit, karar belli. */}
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
                      {upperIn(exiting.choice === 'like' ? t.stamp.like : t.stamp.pass, locale)}
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
  /* İkinci satır ailenin açık tonunda; terracotta tarafta açık ton token'ı yok, en yakın durak `muted`. */
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
  /* Ad ve tanıtım fotoğrafın üstünde. */
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
    /* İçerik optik merkezde, puan kazanma anının deseni; `flexGrow` kaydırmayı bozmaz, içerik uzunsa kap büyür. */
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
  /* 4:6, `EmptyState` ve geri bildirim sonucuyla aynı oran. */
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
