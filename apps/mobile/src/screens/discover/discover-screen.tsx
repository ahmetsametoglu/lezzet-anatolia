import type { LocalizedCopy } from '@lezzet/i18n';
import type { DiscoverCard, FeedbackVote } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { deviceLocale } from '@/lib/i18n/locale';
import { publishToast } from '@/lib/toast/toast-store';
import { HeartIcon } from '@/screens/feedback/feedback-icons';
import messages from './messages.json';
import { useDiscover } from './use-discover.hook';

/*
  KEŞİF TURU (v3 `vKesif`, tasarım 05: v3:351-392 + kurucu `kv` v3:721-729 + kGo v3:524-527) —
  aday ürünler kart kart gösterilir, müşteri beğenir ya da geçer; deste bitince teşekkür ve puan.
  Vitrinin kesikli davet kutusu ve hesap kartının "puan kazanma yolları" satırı buraya basıyor;
  ekran o iki bağın karşılığıdır.

  ── VERİ ARTIK GERÇEK (21.19; eski `BEKLEYEN(21.17)` kapandı) ───────────────
  Deste `GET /api/v1/discover`ten, oy `POST /api/v1/discover/vote`a, girişsiz turun hesaba
  bağlanması `POST /api/v1/me/discover/claim`e gider — üçü de `use-discover.hook`un arkasında.
  Fixture SİLİNDİ: ekranın okuduğu tek kaynak sözleşmenin kendisi (`DiscoverCard`), elle yazılmış
  ayna tip duplikasyondu (CLAUDE §1).

  ── PUAN CÜMLESİ ARTIK GEÇMİŞ ZAMAN ─────────────────────────────────────────
  Sayı MOTORDAN gelir: her kaydırmanın cevabındaki `pointsAwarded` toplamı (+ girişsiz tur giriş
  dönüşünde talep edilirse onun puanı). Kart sayısı × ayar DEĞİL — ikisi ayrışırsa (günlük tavan,
  B2B, ikinci oy) müşteri gelmeyecek bir ödül için hareket ederdi. Toplam `null` (girişsiz tur) ya
  da `0` ise çip HİÇ çizilmez: kazanılmamış puan vaat edilmez.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **Deste yüksekliği ESNEK**: v3 kartı sabit 470 çiziyor; küçük telefonda sabit yükseklik
     düğmeleri ekranın dışına itiyordu. Kart alanı kalan boşluğu alır, tavanı 470'te durur —
     tasarımın ölçüsü büyük ekranda birebir, küçük ekranda kırpılmadan küçülür.
  2. **Boş deste hâli EKLENDİ** (v3'te yok, web'de var): aday kalmadığında tur BİTMEDİ, hiç
     başlamadı — iki hâl ayrı cümle ister (web `discover-outcome`un `emptyDeck` ayrımı).
  3. **İskelet ve ağ hatası hâlleri EKLENDİ** (v3 destesi hep dolu): gerçek uçtan okuyan her
     ekranın üç hâli olmak zorunda. Hata bloğu kesikli kutu değil, katalog/sipariş ekranlarının
     `EmptyState` + `connection-off` kalıbı — aynı arıza her ekranda aynı görünsün.
  4. **Kalp ikonu geri bildirim ekranından**: v3'ün `vKesif` kalbi ile `vFb` kalbi AYNI geometri
     (aynı `path`) — ikinci kez çizmek duplikasyon olurdu (CLAUDE §1). İkon sözlüğüne terfi
     etmesi gerekiyor, raporlandı.
  5. **"Damak tadı profili" ÇİZİLMEDİ**: ne v3'ün bitiş hâlinde ne web akışında böyle bir çıktı
     var; olmayan bir özelliği tasarımsız uydurmak improvizasyon olurdu (CLAUDE §3).

  ── KAYDIRMA JESTİ (09.08 sonrası) ──────────────────────────────────────────
  Tasarımın kendi cümlesi: *"kaydırma etkileşimi tek elle, dokunmatik akıcılıkta olmalı"*
  (`design/pages/musteri-kesif.md`). Eski sapma notu ("jest yok, çünkü gesture-handler kurulu
  değil") artık geçersiz: iki paket de kurulu ve kök `GestureHandlerRootView` ile sarılı. Kart
  parmağı takip eder; bırakıldığında yeterince uzağa gittiyse ya da yeterince hızlı fırlatıldıysa
  oy verilir, aksi hâlde yerine oturur. Eşikler yüzen sayfanın (`bottom-sheet`) kendi eşikleri —
  iki yerde iki ayrı "yeterince" tanımı olmasın. Düğmeler AYNEN duruyor: jest bir kısayoldur,
  tek erişilebilir yol değil (ekran okuyucu düğmeleri okur).
*/

type Messages = LocalizedCopy<typeof messages>;

/*
  v3'te ölçülmüş, EKRANA-ÖZEL duraklar. Ölçü katmanları (`theme/metrics` + `customer-metrics`)
  bu görevde yazıya kapalı — ham değerler stillere DAĞITILMADI, tek yerde durur; katman
  açıldığında oraya terfi eder (raporlandı).
*/
const discoverMetrics = {
  /** Kart destesinin yüksekliği (v3:355 — 470). Sapma 1: tavan olarak uygulanır. */
  deckHeight: 470,
  /** Arkadaki sıradaki kart (v3:357): küçülme · aşağı kayma · opaklık. */
  nextScale: 0.94,
  nextDrop: 14,
  nextOpacity: 0.55,
  /** Arkadaki kartın görünen fotoğraf payı (v3:358 — %65). */
  nextPhotoRatio: '65%',
  /** Oy düğmesi (v3:365-366 — 64×64). */
  voteButton: 64,
  /** Beğen düğmesinin kalbi (v3:366 — 26). */
  likeIcon: 26,
  /** Teşekkür dairesi ve içindeki ✦ (v3:387 — 88 / 38). */
  thanksMark: 88,
  thanksGlyph: 38,
  /** Kartın çıkışı (v3:30-31 + `kGo`): 330 ms, %130 yol, 9° dönüş. */
  exitMs: 330,
  exitTravel: 1.3,
  exitRotateDeg: 9,
  /** Bırakılan kartın yerine oturması — çıkıştan kısa (geri dönüş bir olay değil, düzeltme). */
  returnMs: 220,
} as const;

/**
 * Oy sayılma eşikleri — yüzen sayfanın (`bottom-sheet`) kendi eşikleri, bilerek AYNI sayılar:
 * "yeterince uzak" kartın kendi genişliğine oranlıdır (sabit piksel dar ekranda çok uzak olurdu),
 * "yeterince hızlı" ise saniyedeki dp. Küçük ama hızlı bir fırlatma da karar demektir.
 */
const SWIPE_RATIO = 0.25;
const SWIPE_VELOCITY = 900;

/** Çıkış eğrisi (v3 `kGo`) — şablonun kendi hızlanması. */
const EXIT_EASING = Easing.in(Easing.ease);

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
  /** Testlerin ve demo hâllerinin kapısı; verilmezse cihazın dili. */
  locale?: ReturnType<typeof deviceLocale>;
}

export function DiscoverScreen({ signedIn, locale = deviceLocale() }: DiscoverScreenProps) {
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const discover = useDiscover(locale, signedIn);

  const [index, setIndex] = useState(0);
  /** Kartın çıkacağı yol — jest de düğme de bu tek mesafeyi kullanır. */
  const travel = width * discoverMetrics.exitTravel;

  /** Parmağın/animasyonun yatay yeri: 0 duruyor, ±`travel` tamamen çıkmış. */
  const drag = useSharedValue(0);
  /** Çıkış sürerken ikinci karar YUTULUR (v3 `kGo`nun ilk satırı) — iki kart birden geçmesin. */
  const locked = useSharedValue(0);

  const cards = discover.cards;
  const card = cards[index] ?? null;
  const nextCard = cards[index + 1] ?? null;

  /* Kartın ekranda kaldığı süre — `dwellMs` sinyal KALİTESİNİN girdisidir, puanın değil
     (DOMAIN §14): ekran ölçer, motor değerlendirir. Ölçüm kartın göründüğü anda başlar. */
  const shownAt = useRef(Date.now());
  useEffect(() => {
    shownAt.current = Date.now();
  }, [index, cards]);

  /** Oy yazılır, kart ilerler, tur bitiyorsa onay verilir. JS tarafı — worklet'ten çağrılır. */
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
      /* Tur bitişi tek onay noktası — v3'te toast yok ama akışın sonu sessiz kalmamalı
         (kitin toast katmanı tam bu iş için var). */
      if (index + 1 >= cards.length) publishToast(t.toast);
    },
    [cards, discover, index, t.toast],
  );

  /* Çıkış animasyonu: jest de düğme de buradan geçer — iki ayrı yol yazılsaydı biri bir gün
     ötekinden farklı bir süreyle çıkardı (yüzen sayfanın `animateClose` dersi). */
  const commit = useCallback(
    (choice: FeedbackVote) => {
      'worklet';
      if (locked.value === 1) return;
      locked.value = 1;
      drag.value = withTiming(
        choice === 'like' ? travel : -travel,
        { duration: discoverMetrics.exitMs, easing: EXIT_EASING },
        () => {
          drag.value = 0;
          locked.value = 0;
          runOnJS(advance)(choice);
        },
      );
    },
    [advance, drag, locked, travel],
  );

  const swipe = Gesture.Pan()
    .onUpdate((event) => {
      if (locked.value === 1) return;
      drag.value = event.translationX;
    })
    .onEnd((event) => {
      if (locked.value === 1) return;
      const farEnough = Math.abs(event.translationX) > width * SWIPE_RATIO;
      const fastEnough = Math.abs(event.velocityX) > SWIPE_VELOCITY;
      if (!farEnough && !fastEnough) {
        drag.value = withTiming(0, { duration: discoverMetrics.returnMs });
        return;
      }
      /* Yön mesafeden okunur; mesafe tam sıfırsa (yerinde fırlatma) hızın işareti karar verir. */
      const forward = event.translationX === 0 ? event.velocityX : event.translationX;
      commit(forward > 0 ? 'like' : 'dislike');
    });

  /* Sağa/sola gittikçe eğilir ve soluklaşır (v3 `kOutL`/`kOutR`); parmak yarı yolda bırakılırsa
     aynı eğri geri sarar — sürüklemenin ve çıkışın görünümü TEK yerde tanımlı. */
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(drag.value), [0, travel], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: drag.value },
      {
        rotate: `${interpolate(
          drag.value,
          [-travel, 0, travel],
          [-discoverMetrics.exitRotateDeg, 0, discoverMetrics.exitRotateDeg],
          Extrapolation.CLAMP,
        )}deg`,
      },
    ],
  }));

  const bar = (
    <AppBar
      title={t.title}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="discover-back" />}
      /* Sayaç bitiş hâlinde de durur (v3: `kv.prog` çubuğun kendisinde, kartın içinde değil) ve
         kural `min(idx+1, toplam)` — şablonun kendi hesabı: son karttan sonra "5 / 5" okunur,
         yani tamamlandığını sayı da söyler. Deste boşken çubuk sayaçsız (sapma 2'nin hâli). */
      right={
        discover.status !== 'ready' || cards.length === 0 ? undefined : (
          <Text style={styles.progress} testID="discover-progress">
            {t.progress
              .replace('{current}', String(Math.min(index + 1, cards.length)))
              .replace('{total}', String(cards.length))}
          </Text>
        )
      }
      testID="discover-appbar"
    />
  );

  if (discover.status === 'loading') {
    return (
      <View style={styles.screen} testID="discover-screen">
        {bar}
        <View style={styles.loading}>
          <LoadingState label={t.loading} accessibilityLabel={t.loading} testID="discover-loading" />
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
    /* ── Bitiş: ✦ · teşekkür · puan çipi · giriş daveti · kataloğa dönüş (v3:385-391) ── */
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

  const [framingBefore, framingAfter] = t.framing.split('{strong}');

  return (
    <View style={styles.screen} testID="discover-screen">
      {bar}
      <View style={styles.body}>
        {/* Çerçeveleme cümlesi — vurgulu parça ayrı anahtar (tek cümle çevrilir, vurgu yerinde kalır). */}
        <Text style={styles.framing}>
          {framingBefore}
          <Text style={styles.framingStrong}>{t.framingStrong}</Text>
          {framingAfter}
        </Text>

        <View style={styles.deck}>
          {/* Sıradaki kart yalnız DERİNLİK bilgisidir: dokunuşu almaz, yalnız fotoğrafının üst
              payı görünür (v3:357-359). */}
          {nextCard === null ? null : (
            <View style={styles.nextCard} pointerEvents="none" testID="discover-next">
              <View style={styles.nextPhoto}>
                <CardPhoto card={nextCard} />
              </View>
            </View>
          )}

          <GestureDetector gesture={swipe}>
            <Animated.View style={[styles.card, cardStyle]} testID="discover-card">
              {/* Gölge DIŞ kutuda, kırpma İÇTE: aynı görünümde `overflow: 'hidden'` gölgeyi de
                  keser (kutunun dışına düşen her şeyi keser) — iki katman ayrılmazsa kartın
                  yükselmesi kaybolurdu. */}
              <View style={styles.cardSurface}>
                <View style={styles.photo}>
                  <CardPhoto card={card} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName} accessibilityRole="header">
                    {card.name}
                  </Text>
                  {card.description === null ? null : <Text style={styles.cardDescription}>{card.description}</Text>}
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>

        {/* ── İki oy düğmesi (v3:363-367): geç (kum çerçeveli beyaz) · beğen (zeytin dolgulu) ── */}
        <View style={styles.voteRow}>
          <PressableSurface
            onPress={() => commit('dislike')}
            feedback="scale-small"
            style={[styles.voteButton, styles.passButton]}
            accessibilityLabel={t.vote.pass}
            testID="discover-pass"
          >
            <Text style={styles.passGlyph}>✕</Text>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  /** Başlık çubuğundaki sayaç (v3:354 — `700 12.5px`, sessiz ton); geri bildirim ekranıyla aynı kademe. */
  progress: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.muted,
  },
  /** Yükleme — deste alanının yerini alır, ekranın dikey ortası (sapma 3). */
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Gövde: v3:355 `padding:14px 18px 0` + `gap:14`. */
  body: {
    flex: 1,
    paddingTop: theme.space['2xl'],
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space['2xl'],
  },
  framing: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
    textAlign: 'center',
  },
  framingStrong: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    color: theme.colors['olive-dark'],
  },

  /* Deste: sabit 470 yerine ESNEK + tavan (sapma 1). */
  deck: {
    flex: 1,
    maxHeight: discoverMetrics.deckHeight,
  },
  /** Sıradaki kart — küçültülmüş, aşağı kaydırılmış, soluk (v3:357). */
  nextCard: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    opacity: discoverMetrics.nextOpacity,
    transform: [{ scale: discoverMetrics.nextScale }, { translateY: discoverMetrics.nextDrop }],
  },
  nextPhoto: {
    height: discoverMetrics.nextPhotoRatio,
  },
  /** Öndeki kart: beyaz, yuvarlak, fotoğraf üstte (esner), künye altta (v3:361-362).
      Yarıçap resmî setten (`card` 20; şablonun 24'ü sette yok) — gölge de setin yüzen durağı. */
  card: {
    position: 'absolute',
    inset: 0,
    borderRadius: theme.radius.card,
    boxShadow: theme.shadow.badge,
  },
  cardSurface: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  photo: {
    flex: 1,
    minHeight: 0,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors['sand-300'],
  },
  photoInitial: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors['on-image-soft'],
  },
  cardText: {
    paddingTop: theme.space['3xl'],
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['4xl'],
    gap: theme.space.sm,
  },
  cardName: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    fontSize: theme.text['h2-sm'],
    color: theme.colors.ink,
  },
  cardDescription: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },

  /* Oy sırası (v3:363): ortalanmış, 26 aralık, altta nefes. Alt güvenli alan dolgunun İÇİNDE
     (kitin yapışkan bar kuralı) — ikisinin büyüğü alınır, toplanmaz. */
  voteRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space['7xl'],
    paddingTop: theme.space.xs,
    paddingBottom: Math.max(rt.insets.bottom, theme.space['5xl']),
  },
  voteButton: {
    width: discoverMetrics.voteButton,
    height: discoverMetrics.voteButton,
    borderRadius: discoverMetrics.voteButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passButton: {
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    boxShadow: theme.shadow.soft,
  },
  passGlyph: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.muted,
  },
  likeButton: {
    backgroundColor: theme.colors.olive,
    boxShadow: theme.shadow.badge,
  },

  /* ── Bitiş hâli (v3:385-391) — geri bildirim ekranının teşekkür bloğuyla aynı kalıp ── */
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
  doneBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
    textAlign: 'center',
  },
  /** Puan çipi (v3:389) — fırsat ailesinin zemini, hap yarıçapı; `overflow` Android'de şart. */
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
