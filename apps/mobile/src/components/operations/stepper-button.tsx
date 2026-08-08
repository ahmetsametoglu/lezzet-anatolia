import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  ARTIR / AZALT DÜĞMESİ — Operasyon Mobil v2'de dört kez, iki ölçüde: tahsilat tutarı (34×34,
  v2:174) ve iade adedi (30×30, v2:158). Geometri dışında ikisi aynı: kum çerçeve, dolgusuz,
  ortada tek karakter, basılıda `.9` küçülme.

  İKİ ÖLÇÜ TEK KOMPONENTTE: fark yarıçapa kadar iniyor (`badge` 12 ⟷ `tight` 8) ve o fark
  tasarımın kendi kararı — 26/30 px'lik bir kutuda 12 px yarıçap neredeyse daire olur ve o an
  "kalem" (kare) ile "durak" (daire) işaretleri birbirine karışır (`operations-app.ts`, `tight`
  durağının gerekçesi). İki ayrı komponent yazmak bu tek kararı iki dosyaya bölerdi.

  İŞARET METİN, İKON DEĞİL: v2 `−` (U+2212) ve `+` karakterlerini yazıyor, `ICON_PATHS`ta
  karşılıkları yok ve olması da gerekmiyor — matematiksel eksi işareti bir çizgi ikonundan daha
  doğru hizalanır. Ekran okuyucuya giden ad `accessibilityLabel` ile gelir.
*/

interface OperationsStepperButtonProps {
  direction: 'increase' | 'decrease';
  onPress: () => void;
  /** Ekran okuyucu adı ("Tutarı artır") — ZORUNLU, işaret karakteri ad yerine geçmez. */
  accessibilityLabel: string;
  /** `md` tahsilat tutarı (34), `sm` iade adedi (30). */
  size?: 'md' | 'sm';
  disabled?: boolean;
  testID?: string;
}

/** v2'nin `−`i eksi İŞARETİdir (U+2212), tire değil: rakamla aynı genişlikte durur. */
const GLYPH = { increase: '+', decrease: '−' } as const;

export function OperationsStepperButton({
  direction,
  onPress,
  accessibilityLabel,
  size = 'md',
  disabled = false,
  testID,
}: OperationsStepperButtonProps) {
  return (
    <PressableSurface
      onPress={onPress}
      disabled={disabled}
      feedback="scale-small"
      compact
      style={[styles.base, styles[size], disabled ? styles.disabled : styles.idle]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Text style={[styles.glyph, disabled ? styles.disabledGlyph : styles.idleGlyph]}>{GLYPH[direction]}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
  },
  md: {
    // v2: 34×34, `border-radius:12px`.
    width: operationsTheme.size.stepButton,
    height: operationsTheme.size.stepButton,
    borderRadius: operationsTheme.radius.badge,
  },
  sm: {
    // v2: 30×30, `border-radius:10px` — resmî sette 10 yok, `tight` (8) en yakını.
    width: operationsTheme.size.dotButton,
    height: operationsTheme.size.dotButton,
    borderRadius: operationsTheme.radius.tight,
  },
  idle: { borderColor: operationsTheme.colors['sand-500'] },
  disabled: { borderColor: operationsTheme.colors['disabled-line'] },
  glyph: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['sheet-title'],
    lineHeight: operationsTheme.text['sheet-title'],
  },
  idleGlyph: { color: operationsTheme.colors.ink },
  disabledGlyph: { color: operationsTheme.colors['disabled-text'] },
});
