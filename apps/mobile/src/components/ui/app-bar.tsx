import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/*
  BAŞLIK ÇUBUĞU — 11 ekranda. Sol yuvada geri düğmesi, ortada başlık, sağ yuvada ekranın kendi
  eylemi (paylaş / ilerleme / rozet / "+ Yeni") durur. İkisi de YUVA (`ReactNode`): çubuk hangi
  içeriğin geleceğini bilmez, yalnız hizayı ve kademeyi garanti eder.

  YAPIŞKANLIK EKRANIN İŞİDİR: RN'de `position: sticky` yok — çubuk kaydırma alanının DIŞINDA
  render edilir, bu komponent yalnız çubuğun kendisidir.

  Üst güvenli alan çubuğun içinde: `rt.insets.top` kadar üst dolgu eklenir; ayrı bir
  SafeAreaView sarmalayıcısı gerekmez ve durum çubuğu ile başlık çakışmaz.

  ── KREM CAM (Token Kararlari #17) ──────────────────────────────────────────
  Zemin artık opak `sand-50` DEĞİL, `cream-glass` (%96 krem) + `blur(8px)`. Fark görsel bir
  süs değil: opak şerit sayfadan kopuk duruyordu ve altından akan listenin kaydığı görünmüyordu;
  yarı saydam yüzey "bu çubuk içeriğin ÜSTÜNDE duruyor" bilgisini taşıyor.

  BULANIKLIK `expo-blur` ile — YEREL MODÜL, dev-client'ın yeniden derlenmesi gerekir.
  Yoğunluk px değil 1–100 arası bir sayıdır ve dönüşümün gerekçesi tek yerde durur
  (`theme/metrics.ts` → `glassBlurIntensity`).

  Unistyles stili ÜÇÜNCÜ TARAF bir komponente veriliyor (`withUnistyles` sarmalayıcısı olmadan);
  kitteki emsali `ProductPhotoCard`ın `LinearGradient`ıdır. Sarmalayıcının kazandırdığı tek şey
  tema DEĞİŞİNCE tek komponentin yeniden çizilmesidir — müşteri vitrini TEK temalıdır ve kırılma
  noktası kullanılmıyor, yani değişecek bir şey yok. İkinci bir tema (operasyon yüzeyi) geldiği
  gün bu iki çubuk sarmalayıcıya alınmalı.

  BEKLEYEN(21.7) — ANDROID'DE ARKA PLAN BULANIKLIĞI: expo-blur Android'de altındaki içeriği
  bulanıklaştırmak için o içeriğin bir `BlurTargetView` ile sarılmasını ve ref'inin `blurTarget`
  prop'una verilmesini istiyor (docs.expo.dev/versions/v57.0.0/sdk/blur-view). Bu, kitteki çubuğun
  EKRANIN kaydırma alanına ref ile bağlanması demek — kabuk ile ekran arasında yeni bir sözleşme.
  Bugün verilmedi: iOS'ta bulanıklık çalışıyor, Android'de yüzey %96 krem olarak çiziliyor (yani
  dünkü opak hâlden iyi, tasarımdan bir adım geride). Ekran başına ref sözleşmesi, ekranlar
  yazıldıkça tek seferde kurulacak.
*/

interface AppBarProps {
  /** Ekran başlığı — i18n üstte çözülür. */
  title: string;
  /** Sol yuva: genellikle `BackButton`; sekme köklerinde boş bırakılır. */
  left?: ReactNode;
  /** Sağ yuva: paylaş düğmesi, ilerleme sayacı, "+ Yeni" gibi ekrana özel eylem. */
  right?: ReactNode;
  testID?: string;
}

export function AppBar({ title, left, right, testID }: AppBarProps) {
  const { theme } = useUnistyles();

  return (
    /* Çubuğun KENDİSİ bulanık yüzeydir; krem tonu onun üstündeki tek katmandan gelir. İki katmanı
       ayırmak zorunluydu: `BlurView`in kendi `backgroundColor`ı platforma göre bulanıklığın altına
       ya da üstüne düşüyor, yani "yarı saydam krem" iki cihazda iki farklı şey olurdu. */
    <BlurView intensity={theme.glassBlurIntensity} tint="light" style={styles.bar} testID={testID}>
      <View style={styles.glass} pointerEvents="none" testID={testID === undefined ? undefined : `${testID}-glass`} />
      {left}
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </BlurView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingTop: rt.insets.top + theme.space.md,
    paddingBottom: theme.space.md,
    paddingHorizontal: theme.space['2xl'],
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors.ink,
  },
  /** Bulanıklığın üstündeki krem katman — akıştan çıkarılmış, dokunuşu geçiren tek yüzey. */
  glass: {
    position: 'absolute',
    inset: 0,
    backgroundColor: theme.colors['cream-glass'],
  },
  title: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['screen-title--font-weight']],
    fontSize: theme.text['screen-title'],
    color: theme.colors.ink,
  },
}));
