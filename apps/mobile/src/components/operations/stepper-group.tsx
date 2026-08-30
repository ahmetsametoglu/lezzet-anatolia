import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  BAĞLI SAYAÇ — `− 3 +` tek çerçevenin içinde (Operasyon Mobil v3, SEKİZ kullanım: adet
  çekmecesinin koli satırları ve "koli dışı tek paket" sayacı `00-ortak`ta dört, mal kabul ile
  plansız kabulün hasarlı paket sayacında ikişer).

  ── NİÇİN `OperationsStepperButton` DEĞİL ───────────────────────────────────
  O komponent AYRI DURAN bir ± düğmesidir: kendi çerçevesi, kendi karesi, aralarında boşluk. Bu ise
  TEK BİR KUTUDUR — çerçeve dışta, üç hücre içeride çerçevesiz, aralarında boşluk yok. İkisi aynı
  şeyin iki boyu değil, iki ayrı kalıp: v3'te ikisi de var ve yan yana duruyorlar. Ayrımın ölçüsü
  tasarımın kendi işaretlemesi — `stepper-button` v2'nin `34×34` dolgusuz düğmesi, bu v3'ün
  `42×46` hücreli grubu.

  ── DEĞER İÇERİDE, ELİN ALTINDA DEĞİL ───────────────────────────────────────
  Ortadaki sayı DOKUNULABİLİR DEĞİL ve bu bilinçli: eldivenli parmak 34 dp'lik bir hedefe
  isabet ettiremez ve yanlışlıkla açılan bir klavye, sayacın var olma sebebini (klavyesiz sayım)
  ortadan kaldırırdı. Sayıyı değiştirmenin tek yolu ± düğmeleridir.

  ── TON BİR RENK DEĞİL, SAYININ ANLAMIDIR ───────────────────────────────────
  `neutral` sayılan mal, `positive` sıfırdan büyük koli (tasarım kutuyu zeytine çeviriyor),
  `error` hasarlı paket. Çağıran rengi değil ANLAMI seçer.
*/

/** Sayının anlamı — renk değil, DURUM. */
type StepperTone = 'neutral' | 'positive' | 'error';

interface OperationsStepperGroupProps {
  value: number;
  onChange: (next: number) => void;
  /** Ekran okuyucuya giden ad — ZORUNLU; "−"/"+" işaretleri ad yerine geçmez. */
  label: string;
  tone?: StepperTone;
  /** Taban; altına inilemez. Sayım negatif olamaz, varsayılan 0. */
  min?: number;
  testID?: string;
}

export function OperationsStepperGroup({
  value,
  onChange,
  label,
  tone = 'neutral',
  min = 0,
  testID,
}: OperationsStepperGroupProps) {
  return (
    <View style={[styles.group, styles[`${tone}Border`]]}>
      <PressableSurface
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        feedback="scale-small"
        compact
        style={styles.cell}
        accessibilityLabel={`${label} — azalt`}
        testID={testID === undefined ? undefined : `${testID}-decrease`}
      >
        {/* Eksi İŞARETİ (U+2212), tire değil: rakamla aynı genişlikte durur. */}
        <Text style={[styles.glyph, value <= min ? styles.glyphDisabled : styles.glyphMinus]}>−</Text>
      </PressableSurface>
      <Text
        style={[styles.value, styles[`${tone}Value`]]}
        accessibilityLabel={`${label}: ${value}`}
        testID={testID === undefined ? undefined : `${testID}-value`}
      >
        {value}
      </Text>
      <PressableSurface
        onPress={() => onChange(value + 1)}
        feedback="scale-small"
        compact
        style={styles.cell}
        accessibilityLabel={`${label} — artır`}
        testID={testID === undefined ? undefined : `${testID}-increase`}
      >
        <Text style={[styles.glyph, styles[`${tone}Plus`]]}>+</Text>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    // Girdi yüzeyi: kartın İÇİNDE ve ondan parlak (operations-app.ts §2 yüzey hiyerarşisi).
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.control,
    // Grup ESNEMEZ: yanındaki metin uzadıkça sayaç daralsaydı dokunma hedefi kısalırdı.
    flexShrink: 0,
  },
  /* Hücre 42×46 — tasarımın ölçüsü. Genişlik dokunma hedefinin altında (44) ama YÜKSEKLİK onu
     aşıyor ve hedef alanı ikisinin çarpımıdır: 42×46, 44×44'ten geniştir. */
  cell: {
    width: operationsTheme.size.iconButtonOnPhoto,
    height: operationsTheme.size.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    lineHeight: operationsTheme.text['icon-sm'],
  },
  glyphMinus: { color: operationsTheme.colors.muted },
  glyphDisabled: { color: operationsTheme.colors['disabled-text'] },
  value: {
    // Sayının kendi kolonu SABİT: 1 ile 10 arasında geçerken düğmeler yer değiştirmemeli.
    width: operationsTheme.size.stepButton,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
  },
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
