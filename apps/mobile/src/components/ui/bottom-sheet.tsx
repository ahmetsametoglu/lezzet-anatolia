import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { BottomSheetModal, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

import { appMetrics } from '@/theme/metrics';

/*
  YÜZEN SAYFA (bottom sheet) — v3'ün tek katman-üstü kalıbı (`shOn`). İçerik YUVADIR: sheet hangi
  içeriğin geleceğini bilmez, yalnız örtüyü, tutamağı, başlığı ve kapanma yollarını garanti eder.
  23 dosya bu dokuz prop'la çağırıyor; kütüphaneyi hiçbiri görmüyor.

  ── GÖVDESİ ARTIK `@gorhom/bottom-sheet` (kullanıcı kararı 01.09) ────────────
  Eski gövde kendi yazdığımız 452 satırdı: RN `Modal` + Reanimated + gesture-handler. Görünüş
  doğruydu ama ARIZALIYDI ve arıza hep aynı kökten çıkıyordu: **açılış animasyonu bir ÖLÇÜME
  bağlıydı.** Panel nereden geleceğini bilmek için kendi yüksekliğini bilmek zorundaydı, onu da
  ancak çizilince (`onLayout`) öğreniyordu. Zincir koptuğunda Modal biniyor, örtü çiziliyor, panel
  ekranın dışında kalıyordu — "çekmece açılmıyor" denen şey buydu. Üç kez, üç kılıkta:

    · 10.08 — ikinci açılış: bileşen sökülmediği için ölçü hafızada kalıyor, `onLayout` "değişmedi"
      diye erken dönüyor, animasyonu kimse başlatmıyor.
    · 30.08 (mal kabul) — iOS kapanmakta olan modal'ın üstüne yenisini SUNMUYOR: panel monte oluyor,
      hiç yerleşmiyor, `onLayout` hiç gelmiyor.
    · 31.08 (toplama) — aynısı, bir ay sonra, başka ekranda.

  İlk ikisinin çaresi belirtiyi kovaladı (bayrak, sonra ekran içi bir kapı, sonra kit çapında bir
  "modal trafiği" kuralı); kök duruyordu. Kütüphane kökü kaldırıyor: `BottomSheetModal` RN
  `Modal`ını KULLANMIYOR, kendi portalıyla (`@gorhom/portal`) uygulama ağacına asılıyor. Native
  modal yoksa "kapanmakta olanın üstüne sunulamaz" diye bir kural da yok — `modal-traffic.ts`,
  `onDismissed` teli ve 450 ms'lik emniyet sayacı bu yüzden söküldü.

  ── NEDEN BU KÜTÜPHANE, NEDEN KİT DEĞİL ─────────────────────────────────────
  Proje kararı GÖRÜNÜŞ DAYATAN TAM KİTİ eliyor (Material/NativeBase sınıfı), tek işi çözen odaklı
  kütüphaneyi değil — `01-teknoloji-secimi §11`. Bu paket davranış getiriyor, görünüş getirmiyor:
  örtü, tutamak ve başlık aşağıda BİZİM komponentlerimiz. `@expo/ui`nin native çekmecesi de aday
  olarak bakıldı ve ELENDİ: kendi dokümanı özel örtü/tutamak/altlığın çizilmediğini söylüyor ve
  iOS'ta SwiftUI sheet, Android'de Compose görünüşü dayatıyor — `.dc.html`'i birebir uygulama
  kuralıyla çatışır.

  ── KORUNAN CİHAZ BULGULARI ─────────────────────────────────────────────────
  Eski gövde yedi ayrı bulgu taşıyordu; hiçbiri kaybolmadı, yeri değişti:
    · klavye paneli ezmez → `keyboardBehavior` + `android_keyboardInputMode` (kütüphane işi)
    · panel tavanı ekranın %82'si, üst güvenli alan korunur → `maxDynamicContentSize` + `topInset`
    · sığmayan içerik kayar → `BottomSheetScrollView`
    · tutamaktan aşağı sürükleyerek kapatma → `enablePanDownToClose`
    · örtü sürüklenirken de solar → kütüphanenin kendi `BottomSheetBackdrop`u
    · içerideki jestler (adet rayı) çalışır → portal hareket kökünün İÇİNDE (`app/_layout`), artık
      Modal'ın içine ikinci bir `GestureHandlerRootView` koymak gerekmiyor
    · alt güvenli alan klavye açıkken EKLENMEZ → `scrollContent`ta, aynı koşulla
*/

interface BottomSheetProps {
  visible: boolean;
  /** Başlık — i18n üstte çözülür; ekran okuyucuda katmanın adıdır. */
  title: string;
  /**
   * Başlık satırının SAĞ yuvası — "sıfırla" gibi panelin tamamına ait bir eylem (tasarım karesi
   * `02b-Adet-Klavyesi`: başlık solda, sıfırla onunla aynı hizada sağda).
   *
   * Eylem başlığın ALTINA konsaydı satırın konusuyla karışırdı: "sıfırla" bir alanı değil
   * çekmecenin tamamını sıfırlıyor.
   */
  titleAction?: ReactNode;
  /**
   * **SABİT BOYLU PANEL** — yalnız içeriği SIFIRDAN büyüyen çekmecelerde (kullanıcı bulgusu 30.08).
   *
   * Ürün arama çekmecesi boşken bir avuç kadar açılıyor, her harfte sonuç geldikçe zıplıyor ve
   * depocunun parmağının altındaki satır yer değiştiriyor. Panelin boyu ARAMANIN kendisiyle
   * belirlenemez; sabit olmalı ki liste onun İÇİNDE dolsun.
   *
   * Verilmezse davranış aynen eskisi: yükseklik içerikten gelir (`enableDynamicSizing`).
   */
  fill?: boolean;
  onClose: () => void;
  /**
   * Çekmece EKRANDAN KALKTIKTAN sonra çağrılır (kütüphanenin `onDismiss`i).
   *
   * NEDEN VAR (21.121, cihazda kanıtlandı 26.08): çekmece açıkken kök yığını değiştirmek
   * (`router.replace`) Fabric'i çökertiyor — söküm ile yeni kabuğun İLK (ağır) mount'u aynı
   * pencereye giriyor ve "The specified child already has a parent" fırlıyor. Çekmeceden çıkıp
   * BAŞKA bir köke gidecek her eylem yönlendirmesini buraya bağlar. `onClose` NİYETİN kancasıdır
   * (görünürlük state'ini düşürür), bu ise sökümün — ikisi bilerek ayrı.
   */
  onClosed?: () => void;
  /**
   * `onClosed`ın eş anlamlısı — GEÇİŞ DÖNEMİ KANCASI, yeni çağıran KULLANMASIN.
   *
   * Eskiden ayrı bir şey demekti: iOS'un `Modal.onDismiss`i, yani "native modal gerçekten kalktı".
   * Ardından İKİNCİ bir modal açacak çağıranlar buna bakmak zorundaydı, çünkü iOS kapanmakta
   * olanın üstüne sunmuyordu. Portal'a geçince o sınırlama ortadan kalktı ve ayrım anlamsızlaştı;
   * kanca yalnız çağıranları kırmamak için duruyor ve `onClosed` ile AYNI anda çağrılıyor.
   */
  onDismissed?: () => void;
  children: ReactNode;
  testID?: string;
}

export function BottomSheet({
  visible,
  title,
  titleAction,
  fill = false,
  onClose,
  onClosed,
  onDismissed,
  children,
  testID,
}: BottomSheetProps) {
  const sheet = useRef<BottomSheetModal>(null);

  /* KAPANIŞIN KAYNAĞI AYIRT EDİLİR: kütüphane `onDismiss`i hem kullanıcı kapatınca hem BİZ
     `dismiss()` çağırınca veriyor. `onClose` ise sözleşmede NİYETİN kancası — çağıranın kendi
     `visible`ını düşürdüğü yer. Ayırmasaydık `visible=false` → `dismiss()` → `onDismiss` →
     `onClose()` zinciri doğardı: bugün zararsız (çağıranların hepsi `setX(false)` yazıyor),
     yarın yan etkisi olan bir çağıranda sessiz bir çift-çalışma. */
  const programmatic = useRef(false);

  useEffect(() => {
    if (visible) {
      /* Bayrak AÇILIŞTA sıfırlanır: kullanıcı sürükleyerek kapattığında `onDismiss` zaten
         çalışmış ve çağıran `visible`ı düşürmüştür — aşağıdaki dal `dismiss()` çağırır, kapalı
         sheet ikinci bir `onDismiss` üretmez ve bayrak `true` asılı kalırdı. Bir sonraki
         kullanıcı kapatması o zaman `onClose`suz geçerdi. */
      programmatic.current = false;
      sheet.current?.present();
      return;
    }
    programmatic.current = true;
    sheet.current?.dismiss();
  }, [visible]);

  /*
    ANDROID'İN GERİ HAREKETİ — kütüphane bunu YAPMIYOR (kaynağında `BackHandler` yok, okundu 01.09).

    Eski gövdede `Modal.onRequestClose` bedavaydı ve künyesi şunu yazıyordu: *"Android'de bir
    katmanın geri tuşuyla kapanmaması ARIZADIR, tasarım eksiği değil."* Göç sırasında sessizce
    kaybolacaktı; kancayı buraya, KİTE koyuyoruz — 23 çekmecenin hepsi aynı sözü tutsun diye.
    iOS'ta `BackHandler` zaten sessiz, koşul gerekmiyor.
  */
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  const handleDismiss = useCallback(() => {
    const wasProgrammatic = programmatic.current;
    programmatic.current = false;
    if (!wasProgrammatic) onClose();
    onClosed?.();
    onDismissed?.();
  }, [onClose, onClosed, onDismissed]);

  /* ÖRTÜ BİZİM, ve bu bir zorunluluk: kütüphanenin `BottomSheetBackdrop`u `testID` geçirmiyor
     (kaynağında `...rest` yok — okundu) ve üç test örtüye dokunuyor. Kendi örtümüz aynı işi
     yapıyor: opaklık panelin konumundan türüyor (parmakla inen panelde örtü de solar — eski
     gövdenin `Math.min(scrimOpacity, dragged)` kuralının kütüphanedeki karşılığı), dokunuş
     `onClose`a gidiyor. Ekran okuyucuya "kapat" diye ayrı bir hedef EKLENMEZ: katmanın kendi
     kapatma düğmeleri okunur, örtü yalnız işaretçi kısayoludur. */
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <Scrim {...props} onPress={onClose} testID={testID} />,
    [onClose, testID],
  );

  /* TUTAMAK + BAŞLIK BİRLİKTE, ve bu bilinçli: ikisi de panelin SABİT bölümü — içerik kayarken
     yerinde kalmalılar. Kütüphanenin `handleComponent`i tam olarak o sabit bölge; başlığı
     içeriğin içine koysaydık uzun listede yukarı kaçardı. */
  const renderHandle = useCallback(
    () => (
      <View style={styles.head}>
        <View style={styles.handleZone} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.handle} />
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.title, styles.titleText]} accessibilityRole="header">
            {title}
          </Text>
          {titleAction}
        </View>
      </View>
    ),
    [title, titleAction],
  );

  /* TAVAN: ekranın %82'si (çekmece hissi — arkadan bir şerit hep görünsün) ile GERÇEKTEN boşta
     olan yerin küçüğü. Klavye yüksekliği düşülür; üst güvenli alanı `topInset` ayrıca koruyor.
     Oran tek kaynaktan (`appMetrics`) okunuyor — stil dosyasıyla iki ayrı 0.82 tutmak, bir gün
     birinin değişip ötekinin kalması demekti. */
  const ceiling =
    Math.min(
      UnistylesRuntime.screen.height * appMetrics.sheetMaxHeightRatio,
      UnistylesRuntime.screen.height - UnistylesRuntime.insets.ime - UnistylesRuntime.insets.top,
    ) - UnistylesRuntime.insets.top;

  return (
    <BottomSheetModal
      ref={sheet}
      /* `fill`de boy SABİT (tek durak), aksi hâlde içerikten gelir — prop künyesi yukarıda. */
      enableDynamicSizing={!fill}
      snapPoints={fill ? [ceiling] : undefined}
      maxDynamicContentSize={ceiling}
      topInset={UnistylesRuntime.insets.top}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backdropComponent={renderBackdrop}
      handleComponent={renderHandle}
      backgroundStyle={styles.panel}
      /* Klavye: içerik parmakla birlikte kayar; Android'de pencere daralır. Eski gövdenin
         `KeyboardAvoidingView` + "klavye arkası kanama" katmanı bunun elle yazılmış hâliydi. */
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      {/* `keyboardShouldPersistTaps`: klavye açıkken gönder düğmesi İLK dokunuşta çalışsın
          (`(21.33)` tuzağı — kullanıcı bulgusu: iki dokunuş gerekiyordu). */}
      {/* KATMANIN KİMLİĞİ KAYDIRMA ALANINDA (01.09): kütüphanenin `BottomSheetModal`ı `testID`
          almıyor (tipinde yok, kaynağında `...rest` de yok) ama on iki ekranın testi çekmeceyi
          kendi kimliğiyle arıyor — "açıldı mı", "içinde şu cümle var mı". Kimlik bu yüzden panelin
          İÇERİK kabında duruyor: kapalıyken kap hiç çizilmiyor, yani `queryByTestId` yine `null`
          diyor ve testlerin ölçtüğü anlam birebir korunuyor. */}
      <BottomSheetScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/** Örtü — künyesi çağırdığı yerde. `animatedIndex`: -1 kapalı, 0 açık. */
function Scrim({
  animatedIndex,
  style,
  onPress,
  testID,
}: BottomSheetBackdropProps & { onPress: () => void; testID?: string }) {
  const fade = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [-1, 0], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[style, fade]} pointerEvents="auto">
      <Pressable
        style={styles.scrim}
        onPress={onPress}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID === undefined ? undefined : `${testID}-scrim`}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create((t, rt) => ({
  scrim: { flex: 1, backgroundColor: t.colors.scrim },
  panel: {
    backgroundColor: t.colors['sand-50'],
    // Şablon 26'lık köşe çiziyor; resmî yarıçap seti (Token Kararlari #7) yüzen sayfayı `card`
    // (20) kademesine bağlıyor — ayrı bir 26 durağı açmak seti dörtten beşe çıkarırdı.
    borderTopLeftRadius: t.radius.card,
    borderTopRightRadius: t.radius.card,
  },
  /** Panelin SABİT bölümü: tutamak + başlık. Yatay nefes burada başlar. */
  head: {
    paddingTop: t.space.lg,
    paddingHorizontal: t.space['5xl'],
    paddingBottom: t.space['2xl'],
    gap: t.space['2xl'],
  },
  /** Tutamağın KAVRAMA bölgesi — görünmez, yalnız parmağa alan açar. */
  handleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: t.space.lg,
    // Kendi dolgusunu ekler, panelin üst boşluğu bir kez sayılsın diye üstteki payı geri alır.
    marginTop: -t.space.lg,
  },
  handle: {
    width: t.size.sheetHandle,
    height: t.border.sheetHandle,
    // Tam yuvarlak uç, kalınlığın YARISINDAN türer — şablonun 3'ü de zaten budur (5/2 ≈ 2,5).
    // Resmî yarıçap seti bu kademeyi taşımaz ve taşımamalı: bu bir köşe değil, bir çubuğun ucu.
    borderRadius: t.border.sheetHandle / 2,
    backgroundColor: t.colors['sand-400'],
  },
  /** Başlık ile sağ eylem AYNI HİZADA (tasarım) — eylem yoksa satır tek çocuklu kalır. */
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.lg },
  titleText: { flex: 1 },
  title: {
    fontFamily: t.font.display[t.text['sheet-title--font-weight']],
    fontSize: t.text['sheet-title'],
    color: t.colors.ink,
  },
  scroll: { flexShrink: 1 },
  /* Şablonun 30 px'lik alt nefesi + cihazın alt güvenli alanı (ana ekran çubuğu).
     KLAVYE AÇIKKEN GÜVENLİ ALAN EKLENMEZ (kullanıcı bulgusu 11.08, iPhone): o pay ana ekran
     çubuğunun ÜSTÜNÜ boş tutmak içindir, klavye zaten o bölgeyi kapatıyor — eklendiğinde
     klavyenin hemen üstünde kullanılamaz bir şerit kalıyor. */
  scrollContent: {
    paddingHorizontal: t.space['5xl'],
    paddingBottom: t.space['8xl'] + (rt.insets.ime > 0 ? 0 : rt.insets.bottom),
    gap: t.space['2xl'],
  },
}));
