import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  İLERLEME ÇUBUĞU — operasyonun "ne kadarı bitti" çizgisi (30.08).

  NEDEN PAYLAŞILAN: aynı çubuk kuryenin gün başlığında (`courier-day-screen`, 21.10) ve depo
  toplama kuyruğunun her satırında (v3:263) duruyor. İkisi de aynı geometriyi ve aynı iki rengi
  kullanıyordu; iki kopya, birinin bir gün ötekinden ayrılması demekti (CLAUDE §1 — hiçbir türde
  duplication yok).

  RENK ÇAĞIRANDAN: kuryede çubuk hep zeytindir (tek bir gün ilerler), depoda satırın DURUMUNU
  taşır — yarım kalan iş terracotta, tamamlanan zeytin, başlanmamış gri. Rengi komponente gömmek,
  depo satırının durumunu anlatmasını engellerdi. Varsayılan zeytin: renk vermeyen çağıran da
  paletin içinde kalır.

  ORAN 0–1 ARASINA KIRPILIR: `pickedLineCount > lineCount` gibi bir veri tutarsızlığı çubuğu
  kutusunun dışına taşırmasın. Kırpma SESSİZDİR ve olması gereken de budur — ekran veriyi
  düzeltmez, yalnız çizemeyeceği bir şeyi çizmeye kalkışmaz.
*/

interface OperationsProgressBarProps {
  /** Tamamlanan oran, 0–1. Aralık dışı değerler kırpılır. */
  value: number;
  /** Dolgunun rengi — tema token'ı; verilmezse zeytin. */
  tone?: string;
  testID?: string;
}

export function OperationsProgressBar({ value, tone, testID }: OperationsProgressBarProps) {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  return (
    <View style={styles.track} testID={testID}>
      <View
        style={[
          styles.fill,
          { width: `${Math.round(ratio * 100)}%`, backgroundColor: tone ?? operationsTheme.colors.olive },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: operationsTheme.space.sm,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: operationsTheme.radius.tight,
  },
});
