import type { ReactNode } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/*
  Basılı geri bildirimin TEK kaynağı. Web'de her etkileşimli öğe `cursor-pointer` + hover
  geri bildirimi taşımak zorunda (CLAUDE §2); RN'de imleç yok, karşılığı BASILI DURUMDUR —
  o yüzden kitteki her dokunulabilir öğe bu yüzeyin üstünde durur, kimse kendi `Pressable`ını
  kurmaz (aksi hâlde geri bildirim kuralı komponent başına yeniden karar konusu olurdu).

  Beş davranış — ilk üçü Token Kararlari #8'in kendisi, son ikisi tasarımın o karara girmemiş
  ama tekrar eden iki çözümü:
  · `shadow`  — sert gölgeli yüzey `translate(2,2)` ile kayar (gölge öğenin kutusuna ait,
                birlikte kayar; tasarımın `style-active`i de aynen böyle davranıyor)
  · `scale`   — gölgesiz yüzey `.97`
  · `scale-small` — küçük öğe (rozet, yuvarlak ikon düğmesi) `.9`
  · `opacity` — metin eylemi; küçültme metin bağlantısında titrek durur, tasarım opaklık kullanır
  · `tint`    — başlık çubuğundaki zeminsiz yuvarlak düğme; tasarım orada 15 kez küçültme değil
                zemin değişimi (`sand-200`) kullanıyor, çünkü çubuk hizası kaymamalı

  DOKUNMA HEDEFİ: görsel ölçüsü 44 dp'nin (Apple HIG) altında kalan öğeler `compact` işaretiyle
  gelir ve `theme.touchSlop` payını alır — pay tek değerdir, öğe başına hesaplanmaz.
*/

type PressFeedback = 'shadow' | 'scale' | 'scale-small' | 'opacity' | 'tint';

interface PressableSurfaceProps {
  children: ReactNode;
  onPress: () => void;
  feedback: PressFeedback;
  /** Yüzeyin görsel stili (zemin, çerçeve, yarıçap, dolgu) — çağıranın işi. */
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Varsayılan `button`; süzgeç/sekme gibi rollerde çağıran değiştirir. */
  accessibilityRole?: 'button' | 'link' | 'tab';
  /** Seçili durum a11y'ye de bildirilir — renk farkı ekran okuyucuya ulaşmaz. */
  selected?: boolean;
  /**
   * SATIRDA ESNEYEN DÜĞME — `flex` DIŞ Pressable'a buradan verilir, `style`e yazılmaz
   * (ölçüldü 23.08, cihaz + uiautomator): `style` İÇ yüzeye gider; dış Pressable stilsiz kalınca
   * içerik kadar daralıyor, içerideki `flex: 1` ise sütun ekseninde yükseklik hesabını çökertip
   * metni ~8 px'e eziyordu ("Vazgeç" görünmez olmuştu — kurye kapanış onayı ve teslim sonuç
   * düğmeleri). `true` = flex 1; sayı = o oran (`1.3` gibi). Jest bunu göremez (stil işlemez),
   * kural buradaki tiptedir: esneyecek düğme `grow` verir, stiline flex yazmaz.
   */
  grow?: number | boolean;
  /** Görsel yüksekliği 44 dp'nin altındaki öğe: dokunma payı eklenir. */
  compact?: boolean;
  /**
   * DOKUNMA PAYININ YÖNÜ — varsayılan `all` (dört yön). Dikey komşusu OLAN öğeler için.
   *
   * Pay görünmezdir ve iki `compact` öğe alt alta durduğunda payları çakışır; çakışan bölgeyi
   * ağaçta sonra gelen kazanır, yani **üstteki öğenin çizili kutusu alttakine geçer.** Sepette
   * ölçüldü (20.08, cihazda): "kaldır"ın 12 dp'lik eteği çizili "+" düğmesinin içine 16 px giriyor
   * ve o noktaya dokunmak ürünü SİLİYORDU (5 adet → 0 kalem).
   *
   * İlk çare aralığı 6 dp'den 26 dp'ye açmaktı; çakışmayı bitirdi ama tasarımın kompozisyonunu
   * bozdu (kullanıcı: "rahatsız edecek kadar olmuş"). Doğrusu aralığı büyütmek değil, payı
   * KOMŞUYA BAKAN YÖNDEN ÇEKMEK:
   * · `up`   — pay yukarı/yanlara; alta hiç verilmez (altında bir komşu var)
   * · `down` — pay aşağı/yanlara; üste hiç verilmez. Aşağıya ÇİFT pay gider, çünkü bu yönü seçen
   *   öğe kısa bir metindir (~20 dp) ve 44 dp eşiğine tek yönden ulaşması gerekir; komşusundan
   *   çalmamanın bedeli budur.
   */
  compactEdges?: 'all' | 'up' | 'down';
  testID?: string;
}

export function PressableSurface({
  children,
  onPress,
  feedback,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  selected,
  grow,
  compact = false,
  compactEdges = 'all',
  testID,
}: PressableSurfaceProps) {
  const { theme } = useUnistyles();
  const slop = theme.touchSlop;
  const hitSlop = !compact
    ? undefined
    : compactEdges === 'up'
      ? { top: slop, bottom: 0, left: slop, right: slop }
      : compactEdges === 'down'
        ? { top: 0, bottom: slop * 2, left: slop, right: slop }
        : slop;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      /* Sert gölge kutunun DIŞINA taşar; kaydırma alanı da çocuklarını sınırında kırpar. İkisi
         birleşince kabın kenarındaki öğenin gölgesi sessizce kayboluyordu (ölçüldü, cihaz 09.08).
         Yer BURADA ayrılır — gölgeyi çizen yüzeyin kendi kutusunda — ki hangi kabın içinde
         durduğu önemsiz olsun ve ekran başına dolgu yaması gerekmesin. Gerekçe `metrics.ts`
         `shadowRoom` künyesinde. */
      style={[
        feedback === 'shadow' ? shadowRoomStyle.room : undefined,
        grow === undefined || grow === false ? undefined : { flex: grow === true ? 1 : grow },
      ]}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
    >
      {/* testID görsel yüzeyde durur (Pressable'da değil): stil oradadır ve `fireEvent.press`
          zaten üst öğedeki işleyiciye tırmanır — böylece tek kimlikle hem davranış hem değer
          doğrulanabiliyor. */}
      {({ pressed }) => (
        <View testID={testID} style={[style, pressed && !disabled ? pressFeedbackStyles[feedback] : undefined]}>
          {children}
        </View>
      )}
    </Pressable>
  );
}

/**
 * Basılı durum stilleri — İHRAÇ EDİLİR çünkü kuralın kendisi budur ve testi de doğrudan bunu
 * okur: RN'in `Pressable`ı basılı durumu iç `Pressability` sorumlusu üzerinden yürütüyor, RNTL
 * o geçici durumu dışarıdan tetikleyemiyor. Kuralı ölçmenin tek dürüst yolu haritayı ölçmek.
 */
/** Sert gölgenin kutu içinde ayrılan yeri — değer `metrics.ts`ten, ham piksel yazılmaz. */
const shadowRoomStyle = StyleSheet.create((theme) => ({
  room: {
    paddingRight: theme.shadowRoom,
    paddingBottom: theme.shadowRoom,
  },
}));

export const pressFeedbackStyles = StyleSheet.create((theme) => ({
  shadow: {
    transform: [{ translateX: theme.press.translate }, { translateY: theme.press.translate }],
  },
  scale: {
    transform: [{ scale: theme.press.scale }],
  },
  'scale-small': {
    transform: [{ scale: theme.press.scaleSmall }],
  },
  opacity: {
    opacity: theme.press.opacity,
  },
  tint: {
    backgroundColor: theme.colors['sand-200'],
  },
}));
