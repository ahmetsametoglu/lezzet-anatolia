import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { operationsTheme } from '../../theme/unistyles';
import { Icon } from './icon';
import type { IconName } from '@lezzet/design-tokens/icons';
import { PressableSurface } from './pressable-surface';

/*
  Birincil düğme, müşteri ve operasyonun ortak düğmesi: iki tasarım aynı dili konuşuyor (yazı çifti, zeytin, 52 dp), fark yalnız ton ve
  yükselti ve ikisi de prop. `block` tam genişlik ve gölgeliyse basılıda kayar, `pill` içerik genişliğinde ve basılıda küçülür.
*/

/**
 * Dolgu tonu rolden seçilir: `olive` akışı ilerletir, `ink` nötr bir kararı uygular ("Tekrar dene", "Seferi kapat"), `error` geri
 * alınamayan olumsuz kaydı yapar (kuryenin "Onayla — kaydet"i).
 */
type ButtonTone = 'olive' | 'ink' | 'error';

/**
 * Yükselti yüzeyin evrenini söyler: `shadow` müşterinin sert gölgesi, `flat` operasyon tasarımının gölgesiz yüzeyi, `glow` zeytin
 * dolgulu okutma düğmesinin ışıması. Işıma düğmenin rolüne bağlı, konumuna değil; tasarımdaki ışımalı düğmelerin hepsi sayfa akışında.
 */
type ButtonElevation = 'shadow' | 'flat' | 'glow';

/** Tek satırlı etiketin küçülebileceği en alt oran; daha küçüğü düğmedeki öteki yazılardan ayrışır. */
const SINGLE_LINE_MIN_SCALE = 0.85;

interface PrimaryButtonProps {
  /** Düğme etiketi — i18n üstte çözülür. */
  label: string;
  onPress: () => void;
  shape?: 'block' | 'pill';
  tone?: ButtonTone;
  elevation?: ButtonElevation;
  /** Etiketin SOLUNDA çizilen ikon; okutma düğmelerinde tasarımın kendi öğesi. */
  icon?: IconName;
  /**
   * Yan yana esneyen satırda payını alır; esneme dışarıdan verilemez, çünkü `PressableSurface` kendi kutusudur. Sayı da alır:
   * onaylayan düğme vazgeçenden geniş olur, iki eşit düğme hangisinin asıl eylem olduğunu söylemez.
   */
  grow?: boolean | number;
  /**
   * Etiketin altında, düğmenin içinde eylemin bedelini söyleyen ikinci satır ("durakları açar · bildirim gider"): geri alınamaz bir
   * eylemin bedeli basılan şeyin üstünde durmalı, düğmenin dışında kopuk bir nota dönüşürdü.
   */
  hint?: string;
  /** Etiket tek satırda kalır, sığmazsa yazı biraz küçülür: dar alt çubukta fiyatlı etiket iki satıra kırılıp düğmeden taşıyordu. */
  singleLine?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function PrimaryButton({
  label,
  onPress,
  shape = 'block',
  tone = 'olive',
  elevation = 'shadow',
  icon,
  grow = false,
  hint,
  singleLine = false,
  disabled = false,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const { theme } = useUnistyles();
  const isBlock = shape === 'block';
  /* Basılı geri bildirim gölgeyi izler: gölgesiz yüzeyin kayması, altında kaymayı açıklayan bir şey olmadığı için titreme gibi okunur. */
  const lifted = isBlock && !disabled && elevation === 'shadow';
  /* Işıma yalnız etkin düğmede, çünkü pasif düğmenin altındaki zeytin hâle onu basılabilir gösterirdi; biçim koşulu yok, ışıma role bağlı. */
  const glowing = !disabled && elevation === 'glow';

  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback={lifted ? 'shadow' : 'scale'}
      compact={!isBlock}
      grow={grow}
      style={[
        styles.base,
        isBlock ? styles.block : styles.pill,
        /* İpuçlu blok düğmenin yüksekliği taban olur, çünkü etiket ve ipucu 52 dp'ye sığmıyor; hap tek satırlıktır ve ipucu almaz. */
        isBlock && hint !== undefined ? styles.blockStack : undefined,
        disabled ? styles.disabled : styles[tone],
        lifted ? styles.shadow : undefined,
        glowing ? styles.glow : undefined,
      ]}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          size={theme.text['icon-sm']}
          /* İkon etiketle aynı tondan: yan yana iki farklı beyaz, ikonu sonradan yapıştırılmış gibi gösterir. */
          color={disabled ? theme.colors['disabled-text'] : theme.colors[tone === 'error' ? 'card' : 'on-image']}
          bold
        />
      )}
      {hint === undefined ? (
        <Text
          style={[styles.label, disabled ? styles.disabledLabel : labelToneStyle(tone)]}
          {...(singleLine ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: SINGLE_LINE_MIN_SCALE } : {})}
        >
          {label}
        </Text>
      ) : (
        /* İki satır kendi kabında dikey dizilir, çünkü `PressableSurface` kutusunu yatay diziyor ve ipucu etiketin yanına düşerdi. */
        <View style={styles.stack}>
          <Text style={[styles.label, disabled ? styles.disabledLabel : labelToneStyle(tone)]}>{label}</Text>
          <Text style={[styles.hint, disabled ? styles.disabledLabel : styles.enabledHint]}>{hint}</Text>
        </View>
      )}
    </PressableSurface>
  );
}

/* Temaya bağlı olmayan duraklar ayrı düz sayfada: fabrikalı sayfa modül kapsamındaki sabiti göremiyor ve cihazda düşüyordu. */
const staticStyles = StyleSheet.create({
  glow: { boxShadow: operationsTheme.shadow.glow },
});

/** Etiketin dolguya göre tonu: sıcak (hata) dolgu saf beyaz, soğuk (zeytin, mürekkep) dolgu krem ister. */
function labelToneStyle(tone: ButtonTone) {
  return tone === 'error' ? styles.enabledLabel_hard : styles.enabledLabel_soft;
}

const styles = StyleSheet.create((theme) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    /* İkon–metin aralığı koşulsuz yazılır, çünkü tek çocuklu satırda boşluğun karşılığı yoktur. */
    gap: theme.space.lg,
  },
  /** İpuçlu blok düğme: yükseklik taban olur ve içerik onu büyütebilir. */
  blockStack: {
    height: undefined,
    minHeight: theme.size.controlStack,
    /* Dolgu tabanın içinde kalır; metin uzarsa kutu onunla birlikte büyür. */
    paddingVertical: theme.space.md,
  },
  block: {
    height: theme.size.controlLg,
    borderRadius: theme.radius.control,
    /* Yatay dolgu tam genişlikte görünmez ama ortalanmış kapta büzülen düğmede etiketin kenara yapışmasını önler. */
    paddingHorizontal: theme.space['7xl'],
  },
  pill: {
    alignSelf: 'flex-start',
    height: theme.size.controlSm,
    paddingHorizontal: theme.space['7xl'],
    borderRadius: theme.radius.pill,
  },
  shadow: {
    boxShadow: theme.shadow.hard,
  },
  /* Işımanın rengi zeytinin kendisi; değer yalnız operasyon temasında olduğu için temaya bağlı olmayan sayfadan okunur. */
  glow: staticStyles.glow,
  olive: {
    backgroundColor: theme.colors.olive,
  },
  /* Mürekkep dolgu operasyonun "kararı uygula" tonu. Gölge burada zaten anlamsızdı: mürekkep
     gölge mürekkep düğmenin altında görünmez — v3 de bu düğmelerin hiçbirine gölge çizmiyor. */
  ink: {
    backgroundColor: theme.colors.ink,
  },
  /* Olumsuz kaydın dolgusu — tasarımın `#a44a3f`i, yani `error` token'ının kendisi. Gölge yok:
     v3'te sert gölge hiç yok ve bu düğmelerin ikisi de çekmecenin içinde duruyor. */
  error: {
    backgroundColor: theme.colors.error,
  },
  disabled: {
    backgroundColor: theme.colors['disabled-fill'],
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.button,
  },
  /** İki satırlı düğmenin kabı: satırlar ortalı, aralarında en dar boşluk. */
  stack: { alignItems: 'center', gap: 2 },
  hint: {
    /* İpucu etiketin altında sakin bir satır; kademe iki temada da var, çünkü düğme paylaşılan kitin parçası. */
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    textAlign: 'center',
  },
  /* İkinci satır etiketin altyazı tonunda; şeffaflık kullanılmadı, çünkü koyu zemin üstünde alfa öngörülemez bir gri üretir. */
  enabledHint: { color: theme.colors['on-image-soft'] },
  /* Etiket dolguya göre değişir: sıcak kırmızının üstünde krem kirli sarıya kayar, soğuk zeytinin üstünde saf beyaz sert durur. */
  enabledLabel_soft: { color: theme.colors['on-image'] },
  enabledLabel_hard: { color: theme.colors.card },
  disabledLabel: { color: theme.colors['disabled-text'] },
}));
