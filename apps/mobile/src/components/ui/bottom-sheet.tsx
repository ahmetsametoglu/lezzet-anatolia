import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  YÜZEN SAYFA (bottom sheet) — v3'ün tek katman-üstü kalıbı (`shOn`, 6 içerik: çeşit seçimi ·
  sırala&filtrele · adres · kupon · paylaş · ödeme). İçerik YUVADIR: sheet hangi içeriğin
  geleceğini bilmez, yalnız örtüyü, tutamağı, başlığı ve kapanma yollarını garanti eder.

  KAPANMANIN ÜÇ YOLU (tasarımda ikisi çizili, üçüncüsü platformun kendi sözü):
    · örtüye dokunmak (şablonun `shClose`u)
    · içeriğin kendi düğmesi (çağıran `onClose`u kendi çağırır)
    · Android'in geri hareketi/tuşu — `onRequestClose`. Çizili değil ama Android'de bir katmanın
      geri tuşuyla kapanmaması ARIZADIR, tasarım eksiği değil.

  ── ŞABLONDAN SAPMA: AÇILIŞ ANİMASYONU ─────────────────────────────────────
  Şablon örtüyü soldurup (`fadeIn .25s`) paneli AYRICA aşağıdan yukarı kaydırıyor
  (`shUp .32s`). RN'in `Modal`ı tek bir animasyon türü alır: `slide` örtüyü de panelle birlikte
  aşağıdan getirir (yani örtü ekranı süpürerek girer — şablonun söylediği şey değil), `fade`
  ise ikisini birden soldurur. `fade` seçildi: yanlış olan hareket, olmayan hareketten kötüdür.
  İki ayrı eğri gerçek bir animasyon katmanı ister (Reanimated) ve o kitin bugünkü kapsamında yok
  — BEKLEYEN(21.7).
*/

interface BottomSheetProps {
  visible: boolean;
  /** Başlık — i18n üstte çözülür; ekran okuyucuda katmanın adıdır. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
}

export function BottomSheet({ visible, title, onClose, children, testID }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent testID={testID}>
      {/* KLAVYE PANELİ EZEMEZ (kullanıcı bulgusu 08.08 — profil çekmecesinde alanlar klavyenin
          altında kalıyordu): `statusBarTranslucent` bir Modal'da Android pencereyi kendiliğinden
          daraltmaz; kaçınma burada, KİTTE durur — girdili her çekmece (adres, kupon…) aynı
          korumayı otomatik alır, ekranlar tek tek uğraşmaz. */}
      <KeyboardAvoidingView behavior="padding" style={styles.layer} accessibilityViewIsModal>
        {/* Örtü DOKUNULABİLİR ama düğme DEĞİLDİR: ekran okuyucuya "kapat" diye bir hedef eklemek
            yerine katmanın kendi kapatma düğmeleri okunur — örtü yalnız işaretçi kısayoludur. */}
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={testID === undefined ? undefined : `${testID}-scrim`}
        />
        <View style={styles.panel}>
          {/* Panelin ALT KANAMASI — klavye kaçınması paneli kaldırınca panel ile ekran altı
              arasında kalan bölge (klavyenin arkası) örtü renginde kalıyordu ve modern klavyelerin
              KIVRIMLI köşelerinden garip görünüyordu (kullanıcı bulgusu 08.08). Bu katman panel
              zeminini aşağı taşırır: köşelerden görünen artık panelin kendisidir. Klavye kapalıyken
              ekran dışında durur, zararsız. */}
          <View style={styles.keyboardBleed} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          {/* Tutamak — yalnız görsel ipucu (sürükleme henüz yok); ekran okuyucudan gizli. */}
          <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    inset: 0,
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
    // Şablonun 30 px'lik alt nefesi + cihazın alt güvenli alanı (ana ekran çubuğu).
    paddingBottom: theme.space['8xl'] + rt.insets.bottom,
    gap: theme.space['2xl'],
    maxHeight: rt.screen.height * theme.sheetMaxHeightRatio,
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
  handle: {
    alignSelf: 'center',
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
    fontWeight: theme.text['sheet-title--font-weight'],
    color: theme.colors.ink,
  },
}));
