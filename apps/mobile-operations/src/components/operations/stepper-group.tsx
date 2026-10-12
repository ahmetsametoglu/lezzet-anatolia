import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Uygulamanın tek adet deseni: `− 3 +` tek çerçevede, her ekranda aynı yerde; ince ayar ± hücreleriyle, hızlı giriş ortadaki rakama
  basınca çağıranın açtığı çekmeceyle yapılır. Boylar yalnız ölçeği değiştirir, şekil aynı kalır ki personel her ekranda aynı şeyi okusun.
*/

/** Küçük sayacın yüksekliği; seçici satırında sayacın yerine geçen ekle düğmesi de bu boydadır. */
export const STEPPER_SM_HEIGHT = operationsTheme.size.controlSm - operationsTheme.space.md;
const SM_VALUE_WIDTH = operationsTheme.size.stepButton - operationsTheme.space.sm;
/** Küçük sayacın çerçeveyle eni; satırın sağ yuvası bu kadar ayrılır. */
export const STEPPER_SM_WIDTH = operationsTheme.size.stepButton * 2 + SM_VALUE_WIDTH + operationsTheme.border.base * 2;
const INLINE_GLYPH = { fontSize: operationsTheme.text['icon-sm'], lineHeight: operationsTheme.text['icon-sm'] };

/** Sayının anlamı; çağıran rengi değil anlamı seçer. */
type StepperTone = 'neutral' | 'positive' | 'error';

interface OperationsStepperGroupProps {
  /** `null` = hiç sayılmadı; sıfırdan ayrıdır, boş hâlde rakamın yerine `emptyLabel` yazar. */
  value: number | null;
  onChange: (next: number) => void;
  /** Ekran okuyucuya giden ad; "−"/"+" işaretleri ad yerine geçmez. */
  label: string;
  tone?: StepperTone;
  /** Taban; altına inilemez. */
  min?: number;
  /** Fiziksel tavan; verilirse `+` orada söner. "İstenenden fazla" gibi yumuşak sınırı çağıran uyarır. */
  max?: number;
  /** `sm` seçici listesinin satırı · `md` satır içi (varsayılan) · `lg` ekranın konusu olan sayı, tam genişlik. */
  size?: 'sm' | 'md' | 'lg';
  /** Boş hâlde rakamın yerine yazılan işaret. */
  emptyLabel?: string;
  /**
   * Verilirse ortadaki rakam da düğme olur ve çağıran adet çekmecesini açar; on iki adet için artıya on iki kez basılmaz. Çekmecenin
   * içindeki sayaçta verilmez, çünkü çekmece çekmece açamaz.
   */
  onPressValue?: () => void;
  /** Rakama basınca ne olacağını söyleyen ekran okuyucu ipucu. */
  valueHint?: string;
  testID?: string;
}

export function OperationsStepperGroup({
  value,
  onChange,
  label,
  tone = 'neutral',
  min = 0,
  max,
  size = 'md',
  emptyLabel = '—',
  onPressValue,
  valueHint,
  testID,
}: OperationsStepperGroupProps) {
  const atFloor = value === null || value <= min;
  const atCeiling = max !== undefined && value !== null && value >= max;
  const shown = value === null ? emptyLabel : String(value);

  /* Rakam basılabilir de olsa aynı görünür; boş hâl soluktur, çünkü "—" bir değer değil eksikliktir. */
  const deger = (
    <Text
      style={[styles.value, styles[`${size}Value`], value === null ? styles.emptyValue : styles[`${tone}Value`]]}
      accessibilityLabel={`${label}: ${shown}`}
      testID={testID === undefined ? undefined : `${testID}-value`}
    >
      {shown}
    </Text>
  );
  return (
    <View style={[styles.group, styles[`${size}Group`], styles[`${tone}Border`]]}>
      <PressableSurface
        onPress={() => onChange(Math.max(min, (value ?? min) - 1))}
        disabled={atFloor}
        feedback="scale-small"
        compact
        style={[styles.cell, styles[`${size}Cell`]]}
        accessibilityLabel={`${label} — azalt`}
        testID={testID === undefined ? undefined : `${testID}-decrease`}
      >
        {/* Eksi işareti (U+2212), tire değil: rakamla aynı genişlikte durur. */}
        <Text style={[styles.glyph, styles[`${size}Glyph`], atFloor ? styles.glyphDisabled : styles.glyphMinus]}>−</Text>
      </PressableSurface>
      {onPressValue === undefined ? (
        <View style={[styles.valueHit, styles[`${size}ValueHit`], size === 'lg' ? styles.lgPlainValue : null]}>{deger}</View>
      ) : (
        <PressableSurface
          onPress={onPressValue}
          feedback="scale-small"
          compact
          /* Büyük boyda esnemeyi dış kabuk yapar (`grow`); stile yazılan `flex: 1` kabuğa ulaşmaz ve hücreler sola yığılır. */
          grow={size === 'lg'}
          style={[styles.valueHit, styles[`${size}ValueHit`]]}
          accessibilityLabel={`${label}: ${shown}`}
          accessibilityHint={valueHint}
          testID={testID === undefined ? undefined : `${testID}-value-hit`}
        >
          {deger}
        </PressableSurface>
      )}
      <PressableSurface
        /* Boştan artı tabanın bir üstüne çıkar: "saymadım"dan "bir tane var"a tek dokunuş. */
        onPress={() => onChange((value ?? min) + 1)}
        disabled={atCeiling}
        feedback="scale-small"
        compact
        style={[styles.cell, styles[`${size}Cell`]]}
        accessibilityLabel={`${label} — artır`}
        testID={testID === undefined ? undefined : `${testID}-increase`}
      >
        <Text style={[styles.glyph, styles[`${size}Glyph`], atCeiling ? styles.glyphDisabled : styles[`${tone}Plus`]]}>
          +
        </Text>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
    // Yanındaki metin uzadıkça sayaç daralsaydı dokunma hedefi kısalırdı.
    flexShrink: 0,
  },
  smGroup: {},
  mdGroup: {},
  lgGroup: { alignSelf: 'stretch' },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  smCell: { width: operationsTheme.size.stepButton, height: STEPPER_SM_HEIGHT },
  /* 42 genişlik dokunma eşiğinin altında, ama 46 yükseklikle hedef alanı 44×44'ten geniştir. */
  mdCell: {
    width: operationsTheme.size.iconButtonOnPhoto,
    height: operationsTheme.size.controlSm,
  },
  lgCell: {
    width: operationsTheme.size.controlLg,
    height: operationsTheme.size.controlLg,
  },
  glyph: {
    fontFamily: operationsTheme.font.body[400],
  },
  smGlyph: INLINE_GLYPH,
  mdGlyph: INLINE_GLYPH,
  lgGlyph: {
    fontSize: operationsTheme.text.icon,
    lineHeight: operationsTheme.text.icon,
  },
  glyphMinus: { color: operationsTheme.colors.muted },
  glyphDisabled: { color: operationsTheme.colors['disabled-text'] },
  /* Rakamın hücresi düz metin ve düğme hâlinde aynı kutudur; `onPressValue` eklemek rakamı kaydırmaz. */
  valueHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  smValueHit: { width: SM_VALUE_WIDTH, height: STEPPER_SM_HEIGHT },
  /* Orta hedef ± düğmelerinden geniştir: rakam bir tuş değil, çekmeceyi açan alandır. */
  mdValueHit: { width: operationsTheme.size.stepValue, height: operationsTheme.size.controlSm },
  /* İç yüzey enine doldurur, esnemeyi dış kabuk yapar; içe yazılan `flex: 1` sütunda yükseklik hesabını çökertir. */
  lgValueHit: { alignSelf: 'stretch', height: operationsTheme.size.controlLg },
  lgPlainValue: { flexGrow: 1 },
  value: {
    textAlign: 'center',
  },
  smValue: {
    width: SM_VALUE_WIDTH,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
  },
  // Rakamın kolonu sabit: 1 ile 10 arasında geçerken düğmeler yer değiştirmez.
  mdValue: {
    width: operationsTheme.size.stepValue,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
  },
  lgValue: {
    fontFamily: operationsTheme.font.display[600],
    fontSize: operationsTheme.text.h2,
    lineHeight: operationsTheme.text.h2,
  },
  emptyValue: { color: operationsTheme.colors.muted },
  neutralBorder: { borderColor: operationsTheme.colors['sand-300'] },
  positiveBorder: { borderColor: operationsTheme.colors['olive-line'] },
  errorBorder: { borderColor: operationsTheme.colors['error-line'] },
  neutralValue: { color: operationsTheme.colors.ink },
  positiveValue: { color: operationsTheme.colors['olive-dark'] },
  errorValue: { color: operationsTheme.colors.error },
  neutralPlus: { color: operationsTheme.colors.olive },
  positivePlus: { color: operationsTheme.colors.olive },
  errorPlus: { color: operationsTheme.colors.error },
});
