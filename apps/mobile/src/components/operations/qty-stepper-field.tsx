import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  BÜYÜK ADET ALANI — kocaman rakam + altında ne olduğu + sağda ayrı `− +` çifti.

  ── NİÇİN `OperationsStepperGroup` DEĞİL (ikisi de v3'te var) ───────────────
  `stepper-group` TEK KUTUDUR ve sayı ortasında durur (`− 3 +`); satır içi sayımın kontrolü —
  adet çekmecesinin koli satırları, hasarlı paket sayacı. Bu ise bir ÇEKMECENİN ANA ALANIDIR:
  sayı 38 dp'lik Lora ile solda, ± çifti sağda ayrı bir hapta. Fark ölçü değil rol — orada sayı
  satırın bir alanıdır, burada çekmecenin KONUSUDUR ve karşıdan okunur.

  ── İKİ KULLANIM, İKİSİ DE TASARIMDA YAZILI ─────────────────────────────────
  · D1 · toplama — okutulan kalemin adedi (`sheetTopAdet`, 31.08 turunda geldi)
  · D3 · yakın-SKT — imha adedi (`sheetImha`)
  İkisi de aynı iskeleti çiziyor. D3 bugün `stepper-group` ile yazılmış ve o bir SAPMA (tasarımın
  imha çekmecesi baştan beri bu şekil); aynı turda buraya çekiliyor ki iki çekmece iki farklı
  şekilde sayı sormasın.

  ── DEĞER DOKUNULABİLİR DEĞİL ───────────────────────────────────────────────
  `stepper-group`un aynı kararı ve aynı gerekçesi: eldivenli parmakla açılan bir klavye, klavyesiz
  sayımın kendisini bozar. Sayı okunur, ± ile değişir.
*/

interface OperationsQtyStepperFieldProps {
  value: number;
  onChange: (next: number) => void;
  /** Rakamın altındaki açıklama — "bu kutuya konuyor" · "partiden düşülecek". */
  caption: string;
  /** Ekran okuyucuya giden ad — ZORUNLU; "−"/"+" işaretleri ad yerine geçmez. */
  label: string;
  /** Taban; altına inilemez (varsayılan 0). */
  min?: number;
  /**
   * Tavan — verilirse üstüne ÇIKILAMAZ ve `+` söner. Fiziksel duvarlar için (partide olmayan mal
   * düşürülemez); "istenenden fazla" gibi YUMUŞAK sınırlar buraya yazılmaz, çağıran uyarır.
   */
  max?: number;
  testID?: string;
}

export function OperationsQtyStepperField({
  value,
  onChange,
  caption,
  label,
  min = 0,
  max,
  testID,
}: OperationsQtyStepperFieldProps) {
  const atFloor = value <= min;
  const atCeiling = max !== undefined && value >= max;

  return (
    <View style={styles.field} testID={testID}>
      <View style={styles.left}>
        <Text
          style={styles.value}
          accessibilityLabel={`${label}: ${value}`}
          testID={testID === undefined ? undefined : `${testID}-value`}
        >
          {value}
        </Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>

      <View style={styles.pair}>
        <PressableSurface
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={atFloor}
          feedback="scale-small"
          style={styles.cell}
          accessibilityLabel={`${label} — azalt`}
          testID={testID === undefined ? undefined : `${testID}-decrease`}
        >
          {/* Eksi İŞARETİ (U+2212), tire değil: artıyla aynı genişlikte durur. */}
          <Text style={[styles.glyph, atFloor ? styles.glyph_disabled : styles.glyph_minus]}>−</Text>
        </PressableSurface>
        <PressableSurface
          onPress={() => onChange(value + 1)}
          disabled={atCeiling}
          feedback="scale-small"
          style={[styles.cell, styles.cell_right]}
          accessibilityLabel={`${label} — artır`}
          testID={testID === undefined ? undefined : `${testID}-increase`}
        >
          <Text style={[styles.glyph, atCeiling ? styles.glyph_disabled : styles.glyph_plus]}>+</Text>
        </PressableSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space['2xl'],
    // Girdi yüzeyi kartın İÇİNDE ve ondan parlak (operations-app §2 yüzey hiyerarşisi).
    backgroundColor: operationsTheme.colors.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
  },
  left: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  value: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['page-title--font-weight']],
    fontSize: operationsTheme.text['page-title'],
    // Satır yüksekliği rakamın kendisi: Lora'nın varsayılan boşluğu 38 dp'de alta boşluk bırakıyor
    // ve altındaki açıklama sayıdan kopuk duruyordu (tasarım: `line-height:1`).
    lineHeight: operationsTheme.text['page-title'],
    color: operationsTheme.colors.ink,
  },
  caption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    // Çift ESNEMEZ: soldaki rakam büyüdükçe daralsaydı dokunma hedefi kısalırdı.
    flexShrink: 0,
  },
  cell: {
    width: operationsTheme.size.controlSm,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cell_right: {
    borderLeftWidth: operationsTheme.border.base,
    borderLeftColor: operationsTheme.colors['sand-300'],
  },
  glyph: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.icon,
    lineHeight: operationsTheme.text.icon,
  },
  glyph_minus: { color: operationsTheme.colors.muted },
  glyph_plus: { color: operationsTheme.colors.olive },
  glyph_disabled: { color: operationsTheme.colors['disabled-text'] },
});
