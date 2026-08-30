import { BlurView } from 'expo-blur';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';

import { useOperationsShellScroll } from '@/lib/operations/shell-scroll';
import { UnistylesRuntime } from 'react-native-unistyles';

import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';

/*
  YAPIŞKAN MİKRO BAŞLIK (Komponent Envanteri M1b) — sayfa kaydırılınca tepede kalan ince şerit.

  ── TASARIMIN CÜMLESİ VE ÖLÇÜLERİ ──────────────────────────────────────────
  *"44px eşiği geçilince iner (translateY + opacity .22s), tepeye dönüşte kalkar. Yarı saydam
  zemin + blur."* Şablondaki kutu (`Operasyon Mobil v3.dc.html:54`): 50px yükseklik,
  `#f6f4ecfa` zemin, `1.5px solid #e2ddcc` alt çizgi, `blur(8px)`, sol tarafta ekran adı
  (Karla 700/13.5, tek satır, taşarsa üç nokta), sağda künye (Karla 700/10, `.1em`).

  Renkler tabana bağlandı, ham hex YAZILMADI (CLAUDE §3): `#f6f4ec` → `cream`, `#e2ddcc` →
  `neutral-bg`, `#8a8270` → `muted`. Üçünün de eşleme ölçümü `operations-app.ts` §4 künyesinde.

  ── NİÇİN BAŞLIĞIN İÇİNDE DEĞİL, AYRI BİLEŞEN ──────────────────────────────
  `OperationsStackHeader` sayfayla BİRLİKTE kayar (kendi künyesi: *"zeminle aynı renkte, çizgisiz
  ve sayfayla birlikte kayan sıradan bir satır"*). Bu şerit ise kaydırma alanının DIŞINDA durur.
  İkisini tek bileşene koymak, aynı kutuya iki farklı yerleşim kuralı koymak olurdu — üstelik
  mikro başlık bölüm KÖKLERİNDE de gerekiyor ve orada yığın başlığı hiç yok.

  ── RN'DE `position: sticky` YOK ───────────────────────────────────────────
  Envanterin RN notu: *"Yapışkan başlık ve çubuk kaydırıcının dışında, position:absolute ile
  durur; ikisi de Animated.Value ile translateY."* Burada da öyle: şerit kabuğun çocuğu,
  `absolute` ile tepeye çakılı; görünürlüğü `Animated` iki değerle (kayma + saydamlık) veriliyor
  ve `useNativeDriver` ile sürücüye iniyor — kaydırma sırasında JS köprüsü boşta kalır.

  Müşteri kitindeki `AppBar` KULLANILMADI: o bir başlık çubuğudur (Lora başlık + yuvalar, 56px+)
  ve her zaman görünür; bu şerit 50px'lik bir DURUM göstergesidir, yalnız kaydırma sırasında var.
  Ortak olan tek şey cam etkisi — o da `BlurView`in kendisinden geliyor, iki bileşenden değil.
*/

interface OperationsMicroHeaderProps {
  /** Ekranın adı — solda, taşarsa üç noktayla kesilir. */
  title: string;
  /** Sağdaki küçük künye: bölüm adı ya da kısa bağlam ("DEPO", "SEFER SF-26-…"). */
  caption?: string;
  testID?: string;
}

export function OperationsMicroHeader({ title, caption, testID }: OperationsMicroHeaderProps) {
  const { microVisible } = useOperationsShellScroll();
  /* Güvenli alan Unistyles RUNTIME'ından: `useSafeAreaInsets` bir sağlayıcı ister ve kitin
     testleri onu kurmuyor (25 ekran testi bu yüzden düştü). `UnistylesRuntime` kabuğun her
     yerinde okunabilir — `stack-header` de aynı değeri `rt` üstünden alıyor. */
  const insetTop = UnistylesRuntime.insets.top;
  /* Tek sürücü değeri iki özelliği birden taşır (0 → gizli, 1 → inik): ikisi ayrı `Animated.Value`
     olsaydı aynı geçişi iki kez zamanlamak gerekirdi ve biri diğerinden kayabilirdi. */
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: microVisible ? 1 : 0, duration: REVEAL_MS, useNativeDriver: true }).start();
  }, [microVisible, progress]);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: insetTop,
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-STRIP_HEIGHT, 0] }) }],
        },
      ]}
      /* Gizliyken dokunuşu geçirir: şerit tepede duruyor ve `pointerEvents="none"` olmasaydı
         kapalıyken bile altındaki başlığın dokunuşlarını yerdi. */
      pointerEvents="none"
      testID={testID}
    >
      <BlurView intensity={operationsTheme.glassBlurIntensity} tint="light" style={styles.strip}>
        <View style={styles.glass} pointerEvents="none" />
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {caption === undefined ? null : <Text style={styles.caption}>{caption}</Text>}
      </BlurView>
    </Animated.View>
  );
}

/** Şeridin yüksekliği (tasarım: 50px) — kayma mesafesi de bundan türer. */
const STRIP_HEIGHT = 50;
/** İniş/kalkış süresi (tasarım: `transition: transform .22s, opacity .22s`). Ölçekte karşılığı
    olmayan tek değer; ortak bir "hareket" durağı açılırsa oraya taşınır. */
const REVEAL_MS = 220;
/** Şerit kabuğun en üst katmanı: yığın başlığının ve içeriğin üstünde durur. */
const STRIP_LAYER = 20;

/* STİL UNISTYLES DEĞİL, RN'İN KENDİ `StyleSheet`İ — üç deneme sonunda ölçülerek seçildi:
   · `create((theme) => …)` fonksiyon kipi: Unistyles geri çağrıya kayıtlı temaların BİRLEŞİMİNİ
     veriyor; operasyona-özgü duraklar (`neutral-bg`, `cream-glass`) oradan OKUNAMIYOR (12 tip
     hatası). Aynı duvar `theme/unistyles.ts` künyesinde 08.08'de ölçülmüş.
   · `create({ … })` statik kipi: duraklar `operationsTheme` sabitinden okunuyor ama dönüş tipi
     `Animated.View`in ve `BlurView`in stil sözleşmesine girmiyor — bu şeridin animasyonu stille
     BİRLİKTE verilmek zorunda olduğu için çıkış yolu yok.
   RN'in `StyleSheet`i ikisini de çözüyor ve bir şey kaybettirmiyor: operasyon komponentleri
   token'larını zaten sabitten okuyor (kitin tamamı öyle), yani Unistyles'ın tema tepkiselliği
   bu dosyada hiç kullanılmıyordu. Güvenli alan `useSafeAreaInsets` ile geliyor. */
/* Stil adlarının tipi AÇIK veriliyor: `create` bu projede çıkarımı
   `ViewStyle | TextStyle | ImageStyle` birleşimine düşürüyor ve birleşim ne `Animated.View`in ne
   `BlurView`in stil sözleşmesine giriyor. */
const styles = StyleSheet.create<{
  wrapper: ViewStyle;
  strip: ViewStyle;
  glass: ViewStyle;
  title: TextStyle;
  caption: TextStyle;
}>({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: STRIP_LAYER,
  },
  strip: {
    height: STRIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['5xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderBottomColor: operationsTheme.colors['neutral-bg'],
    overflow: 'hidden',
  },
  /* Krem katman bulanıklığın ÜSTÜNDE ayrı bir yüzey — `BlurView`in kendi zemini platforma göre
     altına ya da üstüne düşüyor (`app-bar.tsx` künyesinde ölçülü). */
  glass: { position: 'absolute', inset: 0, backgroundColor: operationsTheme.colors['cream-glass'] },
  title: {
    flex: 1,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  caption: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.micro),
    color: operationsTheme.colors.muted,
  },
});
