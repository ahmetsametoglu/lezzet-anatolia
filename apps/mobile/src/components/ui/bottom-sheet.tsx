import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

/*
  YÜZEN SAYFA (bottom sheet) — v3'ün tek katman-üstü kalıbı (`shOn`, 6 içerik: çeşit seçimi ·
  sırala&filtrele · adres · kupon · paylaş · ödeme). İçerik YUVADIR: sheet hangi içeriğin
  geleceğini bilmez, yalnız örtüyü, tutamağı, başlığı ve kapanma yollarını garanti eder.

  KAPANMANIN DÖRT YOLU:
    · örtüye dokunmak (şablonun `shClose`u)
    · içeriğin kendi düğmesi (çağıran `onClose`u kendi çağırır)
    · Android'in geri hareketi/tuşu — `onRequestClose`. Çizili değil ama Android'de bir katmanın
      geri tuşuyla kapanmaması ARIZADIR, tasarım eksiği değil.
    · TUTAMAKTAN AŞAĞI SÜRÜKLEMEK (09.08) — aşağıdaki bölüm.

  ── ANİMASYON: ARTIK GERÇEK (09.08 — eski `BEKLEYEN(21.7)` kapandı) ─────────
  Şablon örtüyü SOLDURUYOR (`fadeIn .25s`) ve paneli AYRICA aşağıdan yukarı KAYDIRIYOR
  (`shUp .32s`) — iki ayrı öğe, iki ayrı eğri. RN'in `Modal`ı tek bir animasyon türü alır, o
  yüzden burada eskiden `fade` kullanılıyordu ve panel hiç kaymıyordu. Reanimated kurulunca
  (kullanıcı izni 09.08) ikisi ayrıldı: `Modal` artık animasyonsuz (`none`), örtünün opaklığını
  ve panelin `translateY`sini biz yürütüyoruz. Süreler şablonun kendi süreleri.

  KAPANIŞ, AÇILIŞIN AYNASI DEĞİLDİR: panel önce kayıp GİDER, `Modal` ancak ondan sonra sökülür
  (`runOnJS(onClose)` bitişte). `visible` false olur olmaz sökseydik kapanış hiç görünmezdi —
  açılışı animasyonlu, kapanışı ani bir katman yarım kalmış hissi verir.

  ── SÜRÜKLEYEREK KAPATMA ────────────────────────────────────────────────────
  Tutamak artık yalnız görsel ipucu değil, HEDEFİN KENDİSİ: aşağı sürüklenince panel parmağı
  takip eder, bırakılınca iki karar verilir — yeterince uzağa gittiyse (yükseklikinin dörtte
  biri) ya da yeterince hızlı bırakıldıysa KAPANIR, aksi hâlde yerine geri oturur. Mesafe VE hız
  birlikte bakılır: küçük ama hızlı bir fırlatma da kapatma niyetidir, ağır ağır yarıya kadar
  indirip bırakmak da.

  YUKARI SÜRÜKLEME YUTULUR (`Math.max(0, …)`): panel tavanının üstüne çıkmaz. Aksi hâlde çekmece
  ekranın dışına doğru esner ve altında örtü rengi görünürdü.
*/

/** Şablonun kendi süreleri (`fadeIn .25s` · `shUp .32s`). */
const OPEN_MS = 320;
const CLOSE_MS = 240;
const TIMING: WithTimingConfig = { duration: OPEN_MS };
const CLOSE_TIMING: WithTimingConfig = { duration: CLOSE_MS };

/**
 * Kapatma eşikleri. `RATIO` panelin YÜKSEKLİĞİNE oranlıdır — sabit piksel, kısa çekmecede çok
 * uzak, uzun çekmecede çok yakın olurdu. `VELOCITY` saniyedeki dp: hızlı fırlatma mesafeye
 * bakmadan kapatır.
 */
const DISMISS_RATIO = 0.25;
const DISMISS_VELOCITY = 900;

interface BottomSheetProps {
  visible: boolean;
  /** Başlık — i18n üstte çözülür; ekran okuyucuda katmanın adıdır. */
  title: string;
  /**
   * **SABİT BOYLU PANEL** — yalnız içeriği SIFIRDAN büyüyen çekmecelerde (kullanıcı bulgusu 30.08).
   *
   * 10.08'de eklenip aynı gün geri alınan `tall` kademesiyle karıştırılmamalı: o, TEK bir bağlantı
   * için paneli tavana dayıyordu ve altında kocaman bir boşluk bırakıyordu — haklı olarak elendi.
   * Buradaki sorun başka: ürün arama çekmecesi boşken bir avuç kadar açılıyor, her harfte sonuç
   * geldikçe zıplıyor ve depocunun parmağının altındaki satır yer değiştiriyor. Panelin boyu
   * ARAMANIN kendisiyle belirlenemez; sabit olmalı ki liste onun İÇİNDE dolsun.
   *
   * Verilmezse davranış aynen eskisi: yükseklik içerikten gelir.
   */
  fill?: boolean;
  onClose: () => void;
  /**
   * Kapanış animasyonu bitip `Modal` SÖKÜLDÜKTEN sonra, bir kare ertelemeyle çağrılır.
   *
   * NEDEN VAR (21.121, cihazda kanıtlandı 26.08): çekmece açıkken kök yığını değiştirmek
   * (`router.replace`) Fabric'i çökertiyor — Modal'ın sökümü ile yeni kabuğun İLK (ağır)
   * mount'u aynı mount penceresine giriyor ve "The specified child already has a parent"
   * fırlıyor (taze süreçte 4/4; yalnız yönlendirme geciktirilince 0). Çekmeceden çıkıp
   * BAŞKA bir köke gidecek her eylem yönlendirmesini buraya bağlar: kare erteleme, Modal'ın
   * söküm commit'inin Fabric'e işlenmesini garantiler. `onClose` niyetin kancasıdır (görünürlük
   * state'ini düşürür), bu ise sökümün — ikisi bilerek ayrı.
   */
  onClosed?: () => void;
  children: ReactNode;
  testID?: string;
}

export function BottomSheet({ visible, title, fill = false, onClose, onClosed, children, testID }: BottomSheetProps) {
  /* `Modal` KAPANIŞ animasyonu bitene kadar ayakta kalmalı; bu yüzden görünürlüğün iki hâli var:
     çağıranın `visible`ı (niyet) ve buradaki `mounted` (ekranda mı). */
  const [mounted, setMounted] = useState(visible);

  /** Panelin kendi yüksekliği — kapanış mesafesi ve eşiği ondan türer, ekrandan değil. */
  const height = useSharedValue(0);
  /** 0 = yerinde, panelin yüksekliği = tamamen aşağıda. */
  const offset = useSharedValue(0);
  /** Örtünün opaklığı; panelden AYRI yürür (şablonun iki ayrı eğrisi). */
  const scrimOpacity = useSharedValue(0);

  const finishClose = useCallback(() => {
    setMounted(false);
    onClose();
    // Söküm bu commit'te; onClosed BİR KARE sonra — künyesi prop'ta (21.121).
    if (onClosed !== undefined) requestAnimationFrame(onClosed);
  }, [onClose, onClosed]);

  /**
   * Açılış — panel aşağıdan gelir, örtü belirir.
   *
   * ── İKİNCİ AÇILIŞ ARIZASI (kullanıcı bulgusu 10.08, cihazda ölçüldü) ──────
   * Açılış eskiden YALNIZ ilk ölçümde, `onLayout` içinde başlıyordu. Ama bileşen kapanınca
   * SÖKÜLMÜYOR (yalnız `Modal` iniyor) ve paylaşılan değerler hafızada kalıyor: kapanışın
   * bıraktığı `offset = yükseklik` ve `scrimOpacity = 0`. İkinci açılışta ölçü DEĞİŞMEDİĞİ için
   * `onLayout` erken dönüyor, bunları geri alan kod hiç koşmuyordu — `Modal` açılıyor (ekranda
   * kısa bir titreme), panel ekran dışında, örtü görünmez kalıyordu. Yani çekmece bir kez
   * açılıyor, bir daha açılmıyordu; her yüzeyde (vitrin posta kodu, bandın iki çekmecesi).
   * Açılış bu yüzden ölçümden AYRILDI: ölçü bilinmiyorsa `onLayout` başlatır (nereden geleceğini
   * yükseklik söyler), biliniyorsa `visible` etkisi başlatır.
   */
  const animateOpen = useCallback(() => {
    'worklet';
    // Panel her açılışta aşağıdan başlar — kapanışın bıraktığı yeri varsaymak yerine kurulur.
    offset.value = height.value;
    offset.value = withTiming(0, TIMING);
    scrimOpacity.value = withTiming(1, TIMING);
  }, [height, offset, scrimOpacity]);

  /* Sürükleme ve düğme aynı kapanışı kullanır: iki ayrı yol yazılsaydı biri bir gün ötekinden
     farklı bir süreyle kapanırdı. */
  const animateClose = useCallback(() => {
    'worklet';
    scrimOpacity.value = withTiming(0, CLOSE_TIMING);
    offset.value = withTiming(height.value, CLOSE_TIMING, (done) => {
      if (done === true) runOnJS(finishClose)();
    });
  }, [finishClose, height, offset, scrimOpacity]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      /* Ölçü BİLİNİYORSA (ikinci ve sonraki açılışlar) açılış BURADAN başlar: `onLayout` aynı
         ölçüyle yeniden anlamlı bir şey söylemez ve panel kapanışın bıraktığı yerde kalırdı. */
      if (height.value > 0) animateOpen();
      return;
    }
    if (mounted) animateClose();
  }, [animateClose, animateOpen, height, mounted, visible]);

  /* İLK açılışta ölçü bilinmiyor ve açılış oynatılamaz: nereden geleceğini yükseklik söyler.
     O yüzden ilk ölçüm açılışı buradan başlatır. Sonraki ölçümler (içerik değişince — örneğin
     çekmecenin ikinci adımı) yalnız yüksekliği tazeler: sürükleme eşiği doğru kalsın, ama
     açılış animasyonu içerik büyüdü diye baştan oynamasın. */
  const onPanelLayout = useCallback(
    (measured: number) => {
      if (measured === 0) return;
      const wasUnknown = height.value === 0;
      height.value = measured;
      if (wasUnknown) animateOpen();
    },
    [animateOpen, height],
  );

  const drag = Gesture.Pan()
    .onChange((event) => {
      // Yukarı sürükleme yutulur: panel tavanının üstüne çıkmaz.
      offset.value = Math.max(0, offset.value + event.changeY);
    })
    .onEnd((event) => {
      const farEnough = offset.value > height.value * DISMISS_RATIO;
      const fastEnough = event.velocityY > DISMISS_VELOCITY;
      if (farEnough || fastEnough) {
        animateClose();
        return;
      }
      offset.value = withTiming(0, TIMING);
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  /* Örtü sürüklenirken de sönükleşir: panel aşağı indikçe arkası açılır. Kendi zamanlaması
     (`scrimOpacity`) ile sürükleme oranının küçüğü alınır — parmakla inen panelde örtü de iner. */
  const scrimStyle = useAnimatedStyle(() => {
    const dragged = height.value === 0 ? 1 : 1 - offset.value / height.value;
    return { opacity: Math.min(scrimOpacity.value, dragged) };
  });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent testID={testID}>
      {/* JEST KÖKÜ MODAL İÇİNDE AYRICA GEREKİR (24.08). `Modal` kendi pencere hiyerarşisini kurar ve
          uygulama kökündeki `GestureHandlerRootView` (`app/_layout.tsx`) oraya UZANMAZ — RNGH'nin
          kendi kuralı: bir jestin çalışması için aynı köke bağlı olması gerekir. Panelin tutamağı
          bu kökü zaten örtük olarak buluyordu (kapanış sürüklemesi çalışıyor), ama İÇERİĞE konan
          jestler (adet seçicinin rayı — kullanıcı bulgusu 24.08: "sağa sola çektiğimde hareket
          etmiyor") kökü bulamıyordu. Kök burada olunca çekmecenin içine konan HER jest çalışır. */}
      <GestureHandlerRootView style={styles.layer}>
      {/* KLAVYE PANELİ EZEMEZ (kullanıcı bulgusu 08.08 — profil çekmecesinde alanlar klavyenin
          altında kalıyordu): `statusBarTranslucent` bir Modal'da Android pencereyi kendiliğinden
          daraltmaz; kaçınma burada, KİTTE durur — girdili her çekmece (adres, kupon…) aynı
          korumayı otomatik alır, ekranlar tek tek uğraşmaz. */}
      <KeyboardAvoidingView behavior="padding" style={styles.layer} accessibilityViewIsModal>
        {/* Örtü DOKUNULABİLİR ama düğme DEĞİLDİR: ekran okuyucuya "kapat" diye bir hedef eklemek
            yerine katmanın kendi kapatma düğmeleri okunur — örtü yalnız işaretçi kısayoludur. */}
        <Animated.View style={[styles.scrimLayer, scrimStyle]}>
          <Pressable
            style={styles.scrim}
            onPress={onClose}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={testID === undefined ? undefined : `${testID}-scrim`}
          />
        </Animated.View>
        <Animated.View
          style={[styles.panel, fill ? styles.panelFill : null, panelStyle]}
          onLayout={(event) => onPanelLayout(event.nativeEvent.layout.height)}
        >
          {/* Panelin ALT KANAMASI — klavye kaçınması paneli kaldırınca panel ile ekran altı
              arasında kalan bölge (klavyenin arkası) örtü renginde kalıyordu ve modern klavyelerin
              KIVRIMLI köşelerinden garip görünüyordu (kullanıcı bulgusu 08.08). Bu katman panel
              zeminini aşağı taşırır: köşelerden görünen artık panelin kendisidir. Klavye kapalıyken
              ekran dışında durur, zararsız. Sürüklenen panelde de altını kapatır. */}
          <View style={styles.keyboardBleed} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          {/* Tutamak SÜRÜKLEME HEDEFİDİR (09.08). Dokunma alanı çubuğun kendisinden büyük:
              5 dp'lik bir çizgiye parmakla isabet ettirmek beklenemez — kavrama bölgesi çubuğu
              saran şeffaf bir bant. Ekran okuyucudan gizli kalır: sürükleme onun için bir yol
              değil, katmanın kendi kapatma düğmeleri okunur. */}
          <GestureDetector gesture={drag}>
            <View style={styles.handleZone} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {/* İÇERİK KAYAR — kitte, bir kez (kullanıcı bulgusu 11.08, cihazda ölçüldü).
              Panelin boyu içerikten gelir ve tavanı vardır; tavanı aşan içerik daha önce sessizce
              kırpılmıyor, panel ALTA yaslı olduğu için YUKARIDAN taşıyordu: başlık, ilk alan ve
              müşterinin YAZDIĞI kutu ekranın dışına — durum çubuğunun altına — kaçıyordu ve geri
              getirmenin hiçbir yolu yoktu (iOS'ta üst güvenli alan daha yüksek olduğu için kutu
              tamamen kayboluyordu). Tetikleyicisi adres önerileriydi ama sebep listede değil
              buradaydı: girdi taşıyan HER çekmece aynı taşmayı yapabilir.
              Bu çözümü `new-ticket-sheet` 09.08'de kendi içinde bulmuştu (*"sığmayan adım sessizce
              kırpılırdı"*); tek ekranda kalması CLAUDE §1'in duplikasyonuydu — kaba taşındı, oradan
              kaldırıldı. `keyboardShouldPersistTaps`: klavye açıkken gönder düğmesi İLK dokunuşta
              çalışsın (`(21.33)` tuzağı). */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            testID={testID === undefined ? undefined : `${testID}-scroll`}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  /** Opaklığı yürüyen katman; dokunuşu içindeki `Pressable` alır. */
  scrimLayer: {
    position: 'absolute',
    inset: 0,
  },
  scrim: {
    flex: 1,
    backgroundColor: theme.colors.scrim,
  },
  panel: {
    backgroundColor: theme.colors['sand-50'],
    // Şablon 26'lık köşe çiziyor; resmî yarıçap seti (Token Kararlari #7) yüzen sayfayı `card`
    // (20) kademesine bağlıyor — ayrı bir 26 durağı açmak seti dörtten beşe çıkarırdı.
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    paddingTop: theme.space.lg,
    paddingHorizontal: theme.space['5xl'],
    /* Şablonun 30 px'lik alt nefesi + cihazın alt güvenli alanı (ana ekran çubuğu).
       KLAVYE AÇIKKEN GÜVENLİ ALAN EKLENMEZ (kullanıcı bulgusu 11.08, iPhone): o pay ana ekran
       çubuğunun ÜSTÜNÜ boş tutmak içindir, klavye zaten o bölgeyi kapatıyor — eklendiğinde
       klavyenin hemen üstünde kullanılamaz bir şerit kalıyor ve ekran ilk bakışta kesilmiş gibi
       duruyor (içerik aslında kayıyor, işlev kaybı yok). Android'de ölçü klavye açılınca zaten
       sıfıra düşüyor, iOS'ta düşmüyordu; koşul ikisini aynı davranışa getiriyor. */
    paddingBottom: theme.space['8xl'] + (rt.insets.ime > 0 ? 0 : rt.insets.bottom),
    gap: theme.space['2xl'],
    /* TAVAN İKİ ŞEYİN KÜÇÜĞÜ (kullanıcı bulgusu 11.08):
       (1) `sheetMaxHeightRatio` — çekmece hissi: arkadan bir şerit görünsün diye ekranın bir
           kısmını hep boş bırakır. Klavye kapalıyken bağlayıcı olan budur.
       (2) GERÇEKTEN BOŞTA OLAN YER — ekran eksi klavye eksi üstteki güvenli alan. Eskiden yalnız
           (1) vardı ve TAM EKRANA göre hesaplanıyordu: klavye ekranın ~%35'ini alırken panel
           %82'ye kadar büyümeye yetkiliydi, aradaki fark yukarıdan taşıyordu. Üst güvenli alan da
           hiç düşülmüyordu — alt taraf için `insets.bottom` vardı, üst taraf için karşılığı yoktu;
           taşan içerik durum çubuğunun/çentiğin altına giriyordu.
       `insets.ime` klavye yüksekliğidir ve klavye açılıp kapandıkça bu stil kendiliğinden yeniden
       hesaplanır — ölçüyü ekranların tek tek taşımasına gerek kalmaz. */
    maxHeight: Math.min(
      rt.screen.height * theme.sheetMaxHeightRatio,
      rt.screen.height - rt.insets.ime - rt.insets.top,
    ),
    /* TAVAN TEK BAŞINA YETMİYOR (cihazda ölçüldü 11.08, düzeltmenin ilk turu): yukarıdaki ölçü
       `insets.ime`ye dayanıyor ve klavye yüksekliği HER ZAMAN raporlanmıyor — raporlanmadığında
       ikinci sınır düşüyor, oran sınırı da tam ekrana göre olduğu için bağlamıyor ve panel yine
       yukarıdan taşıyordu (başlık durum çubuğunun altında kesildi).
       `flexShrink` ölçüye değil KABIN KENDİSİNE dayanır: klavyeden kaçınma katmanı ne kadar yer
       bırakmışsa panel en fazla o kadar olur — klavye ölçüsü hiç okunamasa bile taşma imkânsız.
       Sığmayan içerik artık yukarıdaki kaydırma alanında kayar. */
    flexShrink: 1,
    /* Üstteki güvenli alan: panel tavana dayandığında durum çubuğunun/çentiğin altına girmesin.
       Alt taraf `paddingBottom`da zaten hesaplanıyordu, üst tarafın karşılığı yoktu. */
    marginTop: rt.insets.top,
  },
  /* SABİT BOY (`fill`): taban = tavan. Yalnız içeriği sıfırdan büyüyen çekmecelerde — künyesi
     prop'ta. `flexShrink: 1` yukarıda duruyor ve burada da geçerli: klavye açılınca panel yine
     kaçınma katmanının bıraktığı yere sığar, tavana yapışıp taşmaz. */
  panelFill: {
    height: Math.min(
      rt.screen.height * theme.sheetMaxHeightRatio,
      rt.screen.height - rt.insets.ime - rt.insets.top,
    ),
  },
  /** Kayan bölge: panelin geri kalanı (tutamak + başlık) sabit kalsın, yalnız içerik kaysın. */
  scroll: {
    flexShrink: 1,
  },
  /* Panelin `gap`i yalnız KARDEŞLER arasında çalışır; kaydırma kabına girdikten sonra içeriğin
     kendi alt nefesi kalmaz — son alan panelin dolgusuna yapışırdı. */
  scrollContent: {
    gap: theme.space['2xl'],
  },
  /** Panel zemininin klavye arkasına taşan uzantısı — yükseklik "her klavyeyi örtecek kadar". */
  keyboardBleed: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    height: rt.screen.height * 0.5,
    backgroundColor: theme.colors['sand-50'],
  },
  /** Tutamağın KAVRAMA bölgesi — görünmez, yalnız parmağa alan açar. */
  handleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: theme.space.lg,
    // Kendi dolgusunu ekler, panelin üst boşluğu bir kez sayılsın diye üstteki payı geri alır.
    marginTop: -theme.space.lg,
  },
  handle: {
    width: theme.size.sheetHandle,
    height: theme.border.sheetHandle,
    // Tam yuvarlak uç, kalınlığın YARISINDAN türer — şablonun 3'ü de zaten budur (5/2 ≈ 2,5).
    // Resmî yarıçap seti bu kademeyi taşımaz ve taşımamalı: bu bir köşe değil, bir çubuğun ucu.
    borderRadius: theme.border.sheetHandle / 2,
    backgroundColor: theme.colors['sand-400'],
  },
  title: {
    fontFamily: theme.font.display[theme.text['sheet-title--font-weight']],
    fontSize: theme.text['sheet-title'],
    color: theme.colors.ink,
  },
}));
