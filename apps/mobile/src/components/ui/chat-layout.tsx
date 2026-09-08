import type { ReactNode, RefObject } from 'react';
import { useCallback, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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

/**
 * "Dibe yapış" eşiği — bu kadar dp kalmışsa operatör GÜNCELİ okuyor sayılır (kullanıcı kararı
 * 08.09: *"Scroll aşağıya çok yakınsa aşağı doğru çekmeli… ama kullanıcı yukarılarda eski
 * mesajlaşmaları okuyorsa yeni gelen mesaj aşağı doğru kaydırmamalı"*).
 *
 * Değer bir baloncuk boyundan biraz büyük: tam dipte olmayı şart koşmak, bir parmak ucu kaymış
 * listede davranışı kapatırdı; çok büyük tutmak ise okuyan operatörü yerinden ederdi.
 */
const STICK_SLOP = 80;

/**
 * Dibe yapışılacak mı — kaydırıcının ölçümünden çıkan TEK karar.
 *
 * Ayrı bir işlev, çünkü kural sınanabilir olmalı ve kaydırıcının içinde sınanamıyor: jest'te
 * düzen hesaplanmıyor, `scrollToEnd` çağrısını ref taklidiyle yakalamak ise kırılgan çıktı
 * (ölçüldü 08.09 — her test TEK BAŞINA geçiyor, toplu koşuda ilki dışında hepsi düşüyordu).
 * Karar burada, bağlantı aşağıda: ikisi ayrı ayrı doğrulanabiliyor.
 */
export function shouldStickToBottom(metrics: {
  layoutMeasurement: { height: number };
  contentOffset: { y: number };
  contentSize: { height: number };
}): boolean {
  return metrics.contentSize.height - metrics.layoutMeasurement.height - metrics.contentOffset.y <= STICK_SLOP;
}

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
  /** İçerik büyüyünce ekranın kendi eklemek istediği iş — dibe çekme kararı KİTİN (künye yukarıda). */
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
  /* Parmağın nerede olduğu REF'te, state'te DEĞİL: her kaydırma karesinde yeniden çizim yapmak
     uzun bir yazışmayı takılır hâle getirirdi ve bu değer çizime hiç girmiyor — yalnız karar anında
     okunuyor. Başlangıç `true`: ekran açılışında yazışma zaten dipte durmalı. */
  const dipte = useRef(true);
  /** İlk yerleşim animasyonsuz olmalı — açılışta gözün önünde kayan bir liste, bir arıza gibi görünür. */
  const ilkYerlesim = useRef(true);
  const kendiRef = useRef<ScrollView | null>(null);

  const olc = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    dipte.current = shouldStickToBottom(event.nativeEvent);
  };

  /** İki ref tek düğüme bakar: kitin kendi kaydırması için `kendiRef`, ekranın "dibe in" kapısı için verilen. */
  const bagla = useCallback(
    (node: ScrollView | null) => {
      kendiRef.current = node;
      if (scrollRef) scrollRef.current = node;
    },
    [scrollRef],
  );

  const buyudu = () => {
    onContentSizeChange?.();
    if (!dipte.current) return;
    const kaydirici = scrollRef?.current ?? kendiRef.current;
    kaydirici?.scrollToEnd({ animated: !ilkYerlesim.current });
    ilkYerlesim.current = false;
  };

  return (
    <KeyboardAvoidingView style={styles.layer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {above}
      <ScrollView
        /* Ref KİMLİĞİ SABİT (`useCallback`): satır içi bir ok işlevi her çizimde yeni bir kimlik
           demek ve React onu her seferinde önce `null`, sonra düğümle çağırır. Kaydırıcıda bu
           gereksiz bir bağlama/çözme trafiği; testte ise gözle görülür bir tuzaktı — ekranın
           tuttuğu ref her çizimde yenileniyordu. */
        ref={bagla}
        style={styles.thread}
        contentContainerStyle={contentContainerStyle}
        onScroll={olc}
        /* 16 ms = kare başına bir ölçüm. Daha seyreği "dipte miyim" sorusunu bayatlatır: parmağını
           yeni kaldırmış operatöre yeni mesaj gelirse yanlış tarafa karar verilir. */
        scrollEventThrottle={16}
        onContentSizeChange={buyudu}
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
