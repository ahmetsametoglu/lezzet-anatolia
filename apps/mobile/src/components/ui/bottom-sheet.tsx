import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Dimensions, Keyboard, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';

/*
  YÜZEN SAYFA (bottom sheet) — v3'ün tek katman-üstü kalıbı (`shOn`). İçerik YUVADIR: sheet hangi
  içeriğin geleceğini bilmez, yalnız örtüyü, tutamağı, başlığı ve kapanma yollarını garanti eder.
  42 çağrı bu dokuz prop'la geliyor; kütüphaneyi hiçbiri görmüyor.

  ── GÖVDE `@gorhom/bottom-sheet`, VE MÜMKÜN OLAN EN SADE HÂLİYLE (kullanıcı kararı 01.09) ────
  Bir önceki deneme cihazda dört arıza çıkardı ve DÖRDÜ DE kütüphaneye eklediğim makinelerdendi:
  kendi örtüm dokunuşları yutuyordu (`pointerEvents` sabitti), kendi açma/kapama muhasebem çekmeceyi
  daha doğmadan portaldan söküyordu, kapanış kancasını kütüphanenin `onDismiss`ine bağlamıştım ve
  o sinyal gelmiyordu, panelin sürükleme jesti içerideki listelerle yarışıyordu.

  Ders: **kütüphaneye ne kadar az şey eklersem o kadar az yerde yanılırım.** Bu yüzden burada
  örtü kütüphanenin, açılma/kapanma kütüphanenin, ölçü kütüphanenin. Bize ait olan yalnız GÖRÜNÜŞ
  (tutamak + başlık + renkler) ve iki DAVRANIŞ: Android'in geri tuşu ve kapanış kancası — ikisi de
  kütüphanede yok ve ikisi de sözleşmemizde var.

  ── NEDEN KÜTÜPHANE ─────────────────────────────────────────────────────────
  Kendi gövdemizin açılışı bir ÖLÇÜME bağlıydı (`onLayout`) ve ölçüm gelmediğinde panel ekranın
  dışında kalıyordu — üç turda üç ekranda (10.08 · 30.08 · 31.08). `BottomSheetModal` RN `Modal`ını
  kullanmıyor, kendi portalına asılıyor; "iOS kapanmakta olanın üstüne sunmaz" sınırlaması da
  böylece ortadan kalkıyor.
*/

interface BottomSheetProps {
  visible: boolean;
  /** Başlık — i18n üstte çözülür; ekran okuyucuda katmanın adıdır. */
  title: string;
  /** Başlık satırının SAĞ yuvası — panelin tamamına ait bir eylem ("sıfırla"). */
  titleAction?: ReactNode;
  /**
   * **SABİT BOYLU PANEL** — yalnız içeriği SIFIRDAN büyüyen çekmecelerde (kullanıcı bulgusu 30.08).
   * Arama çekmecesi boşken bir avuç kadar açılıyor, her harfte büyüyor ve parmağın altındaki satır
   * yer değiştiriyordu. Verilmezse yükseklik içerikten gelir.
   */
  fill?: boolean;
  onClose: () => void;
  /**
   * Çekmece kapandıktan SONRA çağrılır — çekmeceden çıkıp başka bir köke gidecek eylemler
   * yönlendirmeyi buna bağlar (21.121). `onClose` NİYETİN kancasıdır, bu KAPANIŞIN.
   */
  onClosed?: () => void;
  /** `onClosed`ın eş anlamlısı — geçiş dönemi kancası, yeni çağıran kullanmasın. */
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
  /** Kütüphane çekmeceyi ekranda mı tutuyor — `dismiss()` YALNIZ buna bakar (künye aşağıda). */
  const shown = useRef(false);
  /** Çağıranın niyeti açık mıydı — kapanış KANCALARI buna bakar; ikisi AYNI ŞEY DEĞİL. */
  const wanted = useRef(false);

  useEffect(() => {
    if (visible) {
      shown.current = true;
      wanted.current = true;
      sheet.current?.present();
      return;
    }
    /*
      İKİ BAYRAK, ÇÜNKÜ İKİ AYRI SORU (ölçüldü 01.09):
        · `shown` — kütüphane bunu ekranda tutuyor mu? `dismiss()` yalnız buna bakar.
        · `wanted` — çağıran açmak istemiş miydi? `onClosed` yalnız buna bakar.
      Kullanıcı tutamaktan kapattığında çekmece KENDİ kapanır (`shown` düşer) ama çağıranın
      `visible`ı bir tur sonra düşer; tek bayrak olsaydı o turda `onClosed` hiç çağrılmazdı —
      ona kök yönlendirmesi bağlı (prop künyesi).
    */
    if (!wanted.current) return;
    wanted.current = false;
    /*
      HİÇ SUNULMAMIŞ ÇEKMECE KAPATILMAZ — kütüphanenin en pahalı davranışı.

      `dismiss()`, panel zaten kapalı konumdaysa çekmeceyi PORTALDAN SÖKÜYOR (`BottomSheetModal`
      kaynağı: `unmount()`), ve sökülen çekmece bir daha açılmıyor. Çekmecelerimizin çoğu
      `visible={false}` ile monte olduğu için korumasız bir efekt hepsini doğar doğmaz öldürüyordu
      (cihazda ölçüldü 01.09: SKT çekmecesi ve ürün araması hiç açılmadı).
    */
    if (shown.current) {
      shown.current = false;
      sheet.current?.dismiss();
    }

    /* Kapanış kancası BİZDEN: kütüphanenin `onDismiss`i her koşulda gelmiyor (ölçüldü — plansız
       kabulde seçilen ürün hiç eklenmedi). Bir kare erteleme sözleşmenin kendi gerekçesi (21.121). */
    const frame = requestAnimationFrame(() => {
      onClosed?.();
      onDismissed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [onClosed, onDismissed, visible]);

  /* ANDROID'İN GERİ HAREKETİ — kütüphanede `BackHandler` yok (kaynağı okundu). Eski gövdede
     `Modal.onRequestClose` bedavaydı ve künyesi *"Android'de geri tuşuyla kapanmamak ARIZADIR"*
     diyordu; söz kitte tutuluyor. iOS'ta `BackHandler` zaten sessiz. */
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  /*
    KLAVYE PAYI İÇERİĞE VERİLİR — ölçüldü, dört yol denendi (01.09 · cihazda).

    Panel klavye açılınca yerinde kalıyor ve giriş alanı arkada kalıyordu. Sırayla denenenler:

      · `keyboardBehavior` (kütüphanenin kendisi) — çalışmıyor. Klavye kaçınması çekmecedeki
        alanların KAYITLI olmasını istiyor (`textInputNodesRef`, yalnız `BottomSheetTextInput`
        doldurur) ve üstüne `react-native-edge-to-edge` işletim sisteminin varsayılan
        mekanizmasını devre dışı bırakıyor. Kaydı kurdum, yine kıpırdamadı.
      · `rt.insets.ime` — cihazda SIFIR geliyor (ölçüldü); pay hiç uygulanmıyordu.
      · `bottomInset` — etkisiz. Dokümanı da yüzdeli snap point hesabı için tarif ediyor;
        `enableDynamicSizing` ile duruş konumuna dokunmuyor.
      · **İÇERİĞE ALT PAY — ÇALIŞAN TEK YOL.** `enableDynamicSizing` panel boyunu içerikten
        alıyor: içerik klavye kadar uzayınca panel de o kadar yukarı büyüyor.

    Yükseklik RN'in `keyboardDidShow` olayından; cihazda ölçüldü ve doğru geliyor (320).

    ── ÖRTME `height`TEN DEĞİL EKRAN DİBİNDEN HESAPLANIR (ölçüldü 01.09 · cihazda) ────────────
    `endCoordinates.height` klavyenin KENDİ boyudur ve Android'de altındaki hareket çubuğunu
    saymaz. Cihazda ölçüldü: `height` 320 derken klavyenin gerçekten kapattığı yükseklik 336'ydı
    (ekran 904 − `screenY` 568). Aradaki 16, çekmecenin en alt satırını yutmaya yetiyordu — ilk
    turda "çalıştı" dediğim pay, son satırı klavyenin arkasında bırakıyordu ve bunu ancak
    kullanıcı gördü. Ekran DİBİNDEN ölçmek iOS'ta da doğrudur: orada hareket çubuğu zaten
    klavyenin içinde sayılır, iki hesap aynı sayıyı verir. Ekran ölçüsü `screen`den alınır,
    `window`dan değil — `screenY` ekran koordinatıdır.
  */
  const [keyboardPad, setKeyboardPad] = useState(0);
  useEffect(() => {
    const acildi = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardPad(Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY)),
    );
    const kapandi = Keyboard.addListener('keyboardDidHide', () => setKeyboardPad(0));
    return () => {
      acildi.remove();
      kapandi.remove();
    };
  }, []);

  /* Kullanıcı kapattı (sürükleme): çekmece kendi kapandığını söylüyor, bayrak burada düşer ki
     çağıranın `visible`ı düşünce ikinci bir `dismiss()` gitmesin — o çağrı çekmeceyi söker. */
  const handleDismiss = useCallback(() => {
    if (!shown.current) return;
    shown.current = false;
    onClose();
  }, [onClose]);

  return (
    <BottomSheetModal
      ref={sheet}
      enableDynamicSizing={!fill}
      snapPoints={fill ? ['82%'] : undefined}
      enablePanDownToClose
      /* SÜRÜKLEME YALNIZ TUTAMAKTAN — eski gövdenin davranışının aynısı (jest `GestureDetector` ile
         tutamağa bağlıydı). Panelin her yerinden sürüklemek, içerideki her kaydırma alanıyla
         yarışmak demek: SKT tekerlekleri bu yüzden hiç kaymıyordu (ölçüldü 01.09). */
      enableContentPanningGesture={false}
      onDismiss={handleDismiss}
      backdropComponent={Backdrop}
      handleComponent={() => (
        <View style={styles.head}>
          <View style={styles.handleZone} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.handle} />
          </View>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {titleAction}
          </View>
        </View>
      )}
      backgroundStyle={styles.panel}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID={testID}>
        {children}
        {/*
          PAY AYRI BİR BOŞLUKTUR, `paddingBottom` DEĞİL (ölçüldü 01.09 · cihazda).
          `contentContainerStyle` dizisine ikinci bir `paddingBottom` yazmak tabandakini TOPLAMAZ,
          EZER: klavye açılınca içeriğin alt nefesi (`8xl` + güvenli alan) sıfırlanıyor ve son satır
          klavyeye yapışıyordu (içerik 251 → 525 ölçüldü; 46'lık taban 320'yle değişmişti, oysa
          571 olmalıydı). Boşluk olarak eklenince taban yerinde kalır.
        */}
        {keyboardPad > 0 ? <View style={{ height: keyboardPad }} /> : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* ÖRTÜ KÜTÜPHANENİN: dokunuş geçirgenliğini konumdan kendisi hesaplıyor. Kendi örtümü yazdığımda
   `pointerEvents="auto"` sabit kalmış ve kapanan çekmecenin ardında görünmez bir cam bırakmıştı —
   ekran hiçbir dokunuşa cevap vermiyordu (kullanıcı bulgusu 01.09). Bize ait olan yalnız renk. */
function Backdrop(props: React.ComponentProps<typeof BottomSheetBackdrop>) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} style={[props.style, styles.scrim]} />;
}

const styles = StyleSheet.create((t, rt) => ({
  scrim: { backgroundColor: t.colors.scrim },
  panel: {
    backgroundColor: t.colors['sand-50'],
    // Şablon 26'lık köşe çiziyor; resmî yarıçap seti yüzen sayfayı `card` (20) kademesine bağlıyor.
    borderTopLeftRadius: t.radius.card,
    borderTopRightRadius: t.radius.card,
  },
  /** Panelin SABİT bölümü: tutamak + başlık — içerik kayarken yerinde kalır. */
  head: {
    paddingTop: t.space.lg,
    paddingHorizontal: t.space['5xl'],
    paddingBottom: t.space['2xl'],
    gap: t.space['2xl'],
  },
  /** Tutamağın KAVRAMA bölgesi — görünmez, yalnız parmağa alan açar. */
  handleZone: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: t.space.lg, marginTop: -t.space.lg },
  handle: {
    width: t.size.sheetHandle,
    height: t.border.sheetHandle,
    // Tam yuvarlak uç, kalınlığın YARISINDAN türer — bu bir köşe değil, bir çubuğun ucu.
    borderRadius: t.border.sheetHandle / 2,
    backgroundColor: t.colors['sand-400'],
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.lg },
  title: {
    flex: 1,
    fontFamily: t.font.display[t.text['sheet-title--font-weight']],
    fontSize: t.text['sheet-title'],
    color: t.colors.ink,
  },
  /* Şablonun alt nefesi + cihazın alt güvenli alanı. KLAVYE AÇIKKEN güvenli alan EKLENMEZ
     (kullanıcı bulgusu 11.08): o pay ana ekran çubuğunun üstü içindir, klavye zaten orayı kapatır. */
  content: {
    paddingHorizontal: t.space['5xl'],
    /* Klavye payı BURADA DEĞİL, içeriğin sonundaki boşlukta — gerekçesi orada. Buradaki pay
       klavyesiz hâlin nefesi + cihazın alt güvenli alanıdır ve klavye açıkken de KORUNUR. */
    paddingBottom: t.space['8xl'] + rt.insets.bottom,
    gap: t.space['2xl'],
  },
}));
