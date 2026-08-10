import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { DiscoverCard, FeedbackVote } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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
  /** Teşekkür dairesi ve içindeki ✦ (v3:437 — 88 / 38). */
  thanksMark: 88,
  thanksGlyph: 38,
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

  /** Parmağın yatay/dikey yeri (drag) — çıkış animasyonu bunları sıfıra çekerken devralır. */
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  /** Çıkışın ilerlemesi: 0 durgun, +1 sağa tamamen çıkmış, −1 sola. */
  const exit = useSharedValue(0);
  /** Çıkış sürerken ikinci karar YUTULUR (v3 `kGo`nun ilk satırı) — iki kart birden geçmesin. */
  const locked = useSharedValue(0);

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

  /** Oy kuyruğa girer, kart ilerler, tur bitiyorsa onay verilir. JS tarafı — worklet'ten çağrılır. */
  const advance = useCallback(
    (choice: FeedbackVote) => {
      const current = cards[index];
      if (current === undefined) return;
      /* Çıkış animasyonu SÜREDEN DÜŞÜLÜR: karar jest bırakıldığında (ya da düğmeye basıldığında)
         verildi, kartın uçup gittiği 330 ms düşünme süresi değil. Eklenseydi her kaydırma sabit
         bir payla şişer, motorun "hızlı kaydırma" ölçüsü kayardı. */
      const dwellMs = Math.max(0, Date.now() - shownAt.current - discoverMetrics.exitMs);
      /* Yazım DÜŞSE BİLE kart ilerler (web kararı): müşteriyi düzeltemeyeceği bir arızada turun
         ortasında kilitlemeyiz. Düşen yazımın karşılığı hook'ta: o kaydırma sayılmaz. */
      discover.vote({ productId: current.productId, vote: choice, dwellMs });
      setIndex(index + 1);
      if (choice === 'like') setLikes((count) => count + 1);
      /* Tur bitişi tek onay noktası — v3'te toast yok ama akışın sonu sessiz kalmamalı
         (kitin toast katmanı tam bu iş için var). */
      if (index + 1 >= cards.length) publishToast(t.toast);
    },
    [cards, discover, index, t.toast],
  );

  /* Çıkış animasyonu: jest de düğme de buradan geçer — iki ayrı yol yazılsaydı biri bir gün
     ötekinden farklı bir süreyle çıkardı (yüzen sayfanın `animateClose` dersi).
     Parmağın bıraktığı yer (`dragX/dragY`) sıfıra çekilirken `exit` yolu devralır: böylece
     eğim `x/16`dan şablonun çıkış açısına (9°) KESİNTİSİZ geçer, kart zıplamaz. */
  const commit = useCallback(
    (choice: FeedbackVote) => {
      'worklet';
      if (locked.value === 1) return;
      locked.value = 1;
      const timing = { duration: discoverMetrics.exitMs, easing: EXIT_EASING };
      dragX.value = withTiming(0, timing);
      dragY.value = withTiming(0, timing);
      exit.value = withTiming(choice === 'like' ? 1 : -1, timing, () => {
        exit.value = 0;
        locked.value = 0;
        runOnJS(advance)(choice);
      });
    },
    [advance, dragX, dragY, exit, locked],
  );

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
      commit(forward > 0 ? 'like' : 'dislike');
    });

  /** Kartın kendisi: parmağı takip eder, eğilir, çıkarken soluklaşır (v3:2060 + `kOut*`). */
  const cardStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.abs(exit.value),
    transform: [
      { translateX: dragX.value + exit.value * travel },
      { translateY: dragY.value * discoverMetrics.verticalFollow },
      {
        rotate: `${dragX.value / discoverMetrics.rotateDivisor + exit.value * discoverMetrics.exitRotateDeg}deg`,
      },
    ],
  }));

  /* Basılı rozetler ve gölge halesi — üçü de AYNI oranı okur (`min(1, |x|/92)`), yani karar
     eşiğine yaklaşan kartın üç işareti birlikte koyulaşır. */
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
    exit.value = 0;
  }, [discover, dragX, dragY, exit]);

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
        <EmptyState
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
          <View style={styles.thanksMark}>
            <Text style={styles.thanksGlyph}>✦</Text>
          </View>
          <Text style={styles.doneTitle} accessibilityRole="header">
            {t.done.title}
          </Text>
          <Text style={styles.doneLikes} testID="discover-done-likes">
            {likesLabel(t, likes)}
          </Text>
          <Text style={styles.doneBody}>{t.done.body}</Text>

          {/* `null` = ödülün sahibi yok (girişsiz tur) · `0` = motor gerçekten yazmadı (günlük
              tavan · B2B · ikinci oy). İkisinde de çip çizilmez: kazanılmamış puan vaat edilmez. */}
          {discover.awardedPoints === null || discover.awardedPoints === 0 ? null : (
            <Text style={styles.award} testID="discover-award">
              {t.done.award.replace('{points}', String(discover.awardedPoints))}
            </Text>
          )}

          {signedIn ? null : (
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

        <View style={styles.deck}>
          {/* Üçüncü kart yalnız DERİNLİK: fotoğrafı bile yok, kum bir yüzey (v3:406). */}
          {!hasThirdCard ? null : <View style={styles.thirdCard} pointerEvents="none" testID="discover-third" />}

          {/* Sıradaki kart: fotoğrafı görünür ama krem bir tülün altında (v3:408-412). */}
          {nextCard === null ? null : (
            <View style={styles.nextCard} pointerEvents="none" testID="discover-next">
              <CardPhoto card={nextCard} />
              <View style={styles.nextVeil} />
            </View>
          )}

          <GestureDetector gesture={swipe}>
            <Animated.View style={[styles.card, cardStyle]} testID="discover-card">
              {/* Gölge DIŞ katmanlarda, kırpma İÇTE: aynı görünümde `overflow: 'hidden'` gölgeyi
                  de keser. Üç hale kardeş katman — hangisinin görüneceğini opaklık söyler. */}
              <Animated.View style={[styles.glow, styles.glowRest, restGlowStyle]} pointerEvents="none" />
              <Animated.View style={[styles.glow, styles.glowLike, likeGlowStyle]} pointerEvents="none" />
              <Animated.View style={[styles.glow, styles.glowPass, passGlowStyle]} pointerEvents="none" />
              <View style={styles.cardSurface}>
                <CardPhoto card={card} />
                {/* Fotoğrafın üstündeki yazının okunması için koyu gradyan (v3:416). */}
                <LinearGradient {...theme.gradient.photoBottom} style={styles.cardScrim} pointerEvents="none" />
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
                <View style={styles.cardText} pointerEvents="none">
                  <Text style={styles.cardName} accessibilityRole="header">
                    {card.name}
                  </Text>
                  {card.description === null ? null : <Text style={styles.cardDescription}>{card.description}</Text>}
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* ── İki oy düğmesi (v3:428-431): geç (beyaz, kum çerçeveli) · beğen (zeytin dolgulu) ── */}
        <View style={styles.voteRow}>
          <PressableSurface
            onPress={() => commit('dislike')}
            feedback="scale-small"
            style={[styles.voteButton, styles.passButton]}
            accessibilityLabel={t.vote.pass}
            testID="discover-pass"
          >
            <Icon name="close" size={discoverMetrics.passIcon} color={theme.colors.terracotta} />
          </PressableSurface>
          <PressableSurface
            onPress={() => commit('like')}
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
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingTop: theme.space['9xl'],
    /* Alt güvenli alan kaydırma payına EKLENİR (bloğun kendi nefesi 70): kaydırılabilir içerikte
       inset dolgunun içinde yaşar, yoksa son düğme çubuğun altında kalır. */
    paddingBottom: rt.insets.bottom + theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
  },
  thanksMark: {
    width: discoverMetrics.thanksMark,
    height: discoverMetrics.thanksMark,
    borderRadius: discoverMetrics.thanksMark / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['olive-bg'],
  },
  thanksGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: discoverMetrics.thanksGlyph,
    color: theme.colors.ink,
  },
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
  /** Puan çipi (v3:441) — fırsat ailesinin zemini, hap yarıçapı; `overflow` Android'de şart. */
  award: {
    fontFamily: theme.font.body[theme.text['chip--font-weight']],
    fontSize: theme.text.chip,
    color: theme.colors.terracotta,
    backgroundColor: theme.colors['terracotta-bg'],
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
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
