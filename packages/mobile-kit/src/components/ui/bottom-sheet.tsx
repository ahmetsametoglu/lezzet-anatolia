import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Dimensions, Keyboard, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';

/*
  İçerikteki boşluğa dokunuş örtüye düşüp çekmeceyi kapatmasın diye içeriğe hiçbir şey yapmayan bir dokunma jesti verilir: jest
  kütüphanesi dokunuşu önden arkaya ilk jeste teslim eder. Jest çekmece başına üretilir, çünkü tek nesneyi paylaşan çekmeceler
  kütüphanenin "aynı jest birden çok algılayıcıda" uyarısını alır.
*/

/*
  Yüzen sayfa: içerik yuvadır, çekmece yalnız örtüyü, tutamağı, başlığı ve kapanma yollarını garanti eder. Gövde kütüphaneye
  olabildiğince az şey ekler, çünkü eklenen her makine (örtü, açma muhasebesi, kapanış sinyali) cihazda ayrı bir arıza çıkardı.
*/

/** Panel ekranın en çok bu kadarını kaplar: üstte örtü görünmezse metni uzun dillerde çekmece olduğu anlaşılmaz. */
const MAX_HEIGHT_RATIO = 0.82;

interface BottomSheetProps {
  visible: boolean;
  /** Başlık — i18n üstte çözülür; ekran okuyucuda katmanın adıdır. */
  title: string;
  /** Başlık satırının SAĞ yuvası — panelin tamamına ait bir eylem ("sıfırla"). */
  titleAction?: ReactNode;
  /**
   * Sabit boylu panel; yalnız içeriği sıfırdan büyüyen çekmeceler için, çünkü boy içerikten gelirse her harfte büyür ve parmağın
   * altındaki satır yer değiştirir.
   */
  fill?: boolean;
  onClose: () => void;
  /** Çekmece kapandıktan sonra çağrılır; başka köke giden yönlendirme buna bağlanır. `onClose` niyetin, bu kapanışın kancası. */
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
  /** Klavyenin ekran dibinden ölçülen örtme payı — künyesi aşağıdaki dinleyicide. */
  const [keyboardPad, setKeyboardPad] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    if (visible) {
      shown.current = true;
      wanted.current = true;
      /*
        Açılan çekmece arkadaki ekranın klavyesini kapatır, yoksa alt pay çekmeceyi başkasının klavyesi boyunca uzatır. Pay da elle
        sıfırlanır, çünkü kapanma olayı panel açıldıktan sonra gelir ve çekmece gözün önünde kısalırdı.
      */
      Keyboard.dismiss();
      setKeyboardPad(0);
      sheet.current?.present();
      return;
    }
    /*
      İki bayrak, çünkü iki ayrı soru: `shown` kütüphanenin çekmeceyi tutup tutmadığı, `wanted` çağıranın açmak isteyip istemediği.
      Kullanıcı tutamaktan kapatınca `visible` bir tur sonra düşer; tek bayrakla o turda `onClosed` hiç çağrılmazdı.
    */
    if (!wanted.current) return;
    wanted.current = false;
    // Hiç sunulmamış çekmece kapatılmaz: `dismiss()` kapalı paneli portaldan söker ve o çekmece bir daha açılmaz.
    if (shown.current) {
      shown.current = false;
      sheet.current?.dismiss();
    }

    // Kapanış kancası bizden, çünkü kütüphanenin `onDismiss`i her koşulda gelmiyor; bir karelik erteleme yönlendirmeye yer açar.
    const frame = requestAnimationFrame(() => {
      onClosed?.();
      onDismissed?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [onClosed, onDismissed, visible]);

  // Kütüphanede Android'in geri hareketi yok; geri tuşuyla kapanmayan çekmece arızadır. iOS'ta `BackHandler` zaten sessiz.
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  /*
    Klavye payı içeriğe verilir, çünkü panel boyunu içerikten aldığı için içerik uzayınca yukarı büyüyen tek yol bu; kütüphanenin
    klavye davranışı ve güvenli alan payları cihazda etkisiz kaldı. Örtme ekran dibinden hesaplanır, çünkü klavyenin kendi boyu
    Android'de altındaki hareket çubuğunu saymaz ve son satırı yutar.
  */
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

  /** İçerikteki boşluğun dokunuşunu sahiplenen, hiçbir şey yapmayan jest (dosya başındaki künye). */
  const contentTap = useMemo(() => Gesture.Tap(), []);

  // Sürüklemeyle kapanışta bayrak burada düşer ki `visible` düşünce ikinci bir `dismiss()` çekmeceyi sökmesin.
  const handleDismiss = useCallback(() => {
    if (!shown.current) return;
    shown.current = false;
    onClose();
  }, [onClose]);

  return (
    <BottomSheetModal
      ref={sheet}
      enableDynamicSizing={!fill}
      snapPoints={fill ? [`${MAX_HEIGHT_RATIO * 100}%`] : undefined}
      maxDynamicContentSize={Math.round(windowHeight * MAX_HEIGHT_RATIO)}
      enablePanDownToClose
      // Sürükleme yalnız tutamaktan, çünkü panelin her yerinden sürüklemek içerideki kaydırma alanlarıyla yarışır.
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
        {/* Aralık sarmalayıcının içinde, çünkü jest kutusu çocukları tek görünüme indirir ve kabın `gap`i tek çocuğa işlemez. */}
        <GestureDetector gesture={contentTap}>
          <View style={styles.contentInner}>{children}</View>
        </GestureDetector>
        {/* Pay ayrı bir boşluk, çünkü ikinci bir `paddingBottom` tabandakini toplamaz, ezer ve son satır klavyeye yapışır. */}
        {keyboardPad > 0 ? <View style={{ height: keyboardPad }} /> : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

/* Örtü kütüphanenin, çünkü dokunuş geçirgenliğini konumdan kendisi hesaplıyor; elle yazılan örtü kapanan çekmecenin ardında
   dokunuşları yutan görünmez bir cam bırakmıştı. Bize ait olan yalnız renk. */
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
  /* Alt nefes cihazın alt güvenli alanını da taşır; klavye payı burada değil içeriğin sonundaki boşlukta, böylece bu nefes klavye
     açıkken de korunur. */
  content: {
    paddingHorizontal: t.space['5xl'],
    paddingBottom: t.space['8xl'] + rt.insets.bottom,
  },
  /** Çocuklar arasındaki nefes — kabın değil, GERÇEK ebeveynin işi (yukarıdaki künye). */
  contentInner: {
    gap: t.space['2xl'],
  },
}));
