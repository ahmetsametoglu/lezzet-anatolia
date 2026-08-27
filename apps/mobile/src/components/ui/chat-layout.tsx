import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  YAZIŞMA KABI — kaydırılan mesaj listesi + ALTTA SABİT yazma çubuğu.

  Kitin ÜÇÜNCÜ kabı ve üçünün işbölümü nettir:
  · `BottomSheet` — çekmece; içeriği kendi paneli taşır.
  · `FormScroll`  — tam ekran FORM; içeriğin TAMAMI tek kaydırıcıda, çubuk diye bir şey yok.
  · `ChatLayout`  — YAZIŞMA; kaydırılan yalnız liste, çubuk sabit kalır.

  ── NEDEN AYRI BİR KAP (ve neden `FormScroll` değil) ────────────────────────
  `FormScroll`a sarsaydık yazma çubuğu da kaydırma alanına girer ve "yapışkan" olmaktan çıkardı —
  operatör/müşteri yazarken çubuğu kaybederdi. Aynı KORUMA, farklı YERLEŞİM.

  ── NEDEN BİLEŞEN OLDU (27.08 · kullanıcı sorusu) ──────────────────────────
  Kalıp önce talep detayında çözüldü (16.08, iki cihazda ölçülerek) ve künyesiyle orada durdu.
  27.08'de aynı arıza iki operasyon ekranında daha bulununca çözüm oraya da KOPYALANDI — doğru
  hamleydi (yeni çözüm icat etmemek) ama tekrarı üçe çıkardı: üç dosya aynı üç şeyi ayrı ayrı
  yazıyordu (kaçınma kabı · kaydırıcıya `flex: 1` · kardeş çubuk). Kullanıcının sorusu bunu
  görünür kıldı: *"bizim çekmecemiz bir komponent değil mi? tek komponent olunca tek yaklaşım
  sergilemesi gerekmez mi?"* — çekmece için cevap evetti, yazışma için değildi. Artık öyle.

  Kural kapta durunca ekranlar onu unutamaz; `lib/keyboard-scroll-guard.test.ts` de kabı tanıyor.

  ── LİSTE ESNER, ÇUBUK ESNEMEZ (iOS ölçümü 16.08, simülatörde kare ile) ─────
  Klavye açılınca kaçınma kabın altına klavye kadar dolgu koyuyor. Kaydırıcı `flex: 1` almazsa
  İÇERİK BOYUNDA kalır: kap küçülürken o küçülmez ve çubuk ekranın dışına taşar — ölçülen görüntü
  tam buydu (çubuk "klavyenin altında" değil, HİÇ YOKTU). Kısalması gereken listedir. Bu yüzden
  kaydırıcının `style`ı DIŞARIDAN alınmaz; kuralın kendisi burasıdır.

  ── PLATFORM AYRIMI: BURADA TEK YERDE, AMA HENÜZ ÖLÇÜLMÜŞ DEĞİL ────────────
  `behavior` kitin öteki iki kabından FARKLI: `BottomSheet` ve `FormScroll` her platformda
  `padding` kullanıyor, burası iOS'ta `padding` Android'de `height`. Fark bilinçli DEĞİL, tarihsel:
  bu değer 16.08'de talep detayında yazıldı ve iki kabın kararıyla hiç karşılaştırılmadı.

  **Kullanıcı 27.08'de bunu ayrıca işaret etti:** *"Android ile iOS farklı refleksler
  gösterebiliyor, klavye konusu bu konuda dikkat edilmesi gereken bir konu."* Doğru — ve şu an
  depoda aynı sorunun iki cevabı var; hangisinin doğru olduğu masa başında bilinemez. İkisi de
  doğru olabilir (form ile yapışkan çubuk gerçekten farklı davranır), ama bunu bugün kimse
  kanıtlayamıyor. `BEKLEYEN(21.78)`: iki platformda ölçülüp tek karara bağlanacak. Değer artık TEK
  yerde durduğu için o tur bir satır değiştirecek — üç ekranı tek tek gezmeyecek.
*/

interface ChatLayoutProps {
  /**
   * Kaydırıcının ÜSTÜNDE sabit duran şeritler — etiketler, mod satırı, pencere bandı. Kaçınmanın
   * İÇİNDE (klavye açılınca onlar da yukarı kalkar) ama kaydırılmazlar.
   */
  above?: ReactNode;
  /** Kaydırılan yazışma. */
  children: ReactNode;
  /** Altta SABİT duran yazma çubuğu — akışta, mutlak konumlu değil (kendi yerini kaplar). */
  composer: ReactNode;
  /** Sona kaydırmak isteyen ekranların kapısı (`scrollToEnd`). */
  scrollRef?: RefObject<ScrollView | null>;
  /** Yazışmanın kendi dolgusu/aralığı — ekranın `styles.content`u olduğu gibi geçer. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** İçerik büyüyünce ne yapılacağı ekranın kararı: kimi sona çeker, kimi yalnız taze içerikte. */
  onContentSizeChange?: () => void;
  /** Kaydırıcının kimliği — testler ve ekran görüntüsü araçları bunu arıyor, ekrandan gelir. */
  testID?: string;
}

export function ChatLayout({
  above,
  children,
  composer,
  scrollRef,
  contentContainerStyle,
  onContentSizeChange,
  testID,
}: ChatLayoutProps) {
  return (
    <KeyboardAvoidingView style={styles.layer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {above}
      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={contentContainerStyle}
        onContentSizeChange={onContentSizeChange}
        /* Klavye açıkken düğmeye İLK dokunuş yutulmaz (MB-01) — kitin öteki iki kabının da
           taşıdığı yarı. Yazışmada bu özellikle görünür: çubuk klavyenin hemen üstünde durur ve
           "gönder"e basmak, klavyeyi kapatan bir dokunuşla aynı yere denk gelir. */
        keyboardShouldPersistTaps="handled"
        testID={testID}
      >
        {children}
      </ScrollView>
      {composer}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /** Başlığın ALTINDAKİ her şey — kaçınma kabı buradan başlar (`FormScroll`un `layer`ıyla aynı rol). */
  layer: { flex: 1 },
  /** Kaydırıcının KENDİSİ — kalan alanı doldurur ve klavye açılınca kısalır (dosya künyesi). */
  thread: { flex: 1 },
});
