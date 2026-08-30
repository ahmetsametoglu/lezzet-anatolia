import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  YAPIŞKAN CTA ÇUBUĞU — listenin altında duran, sayfayla birlikte kaymayan eylem şeridi.

  ── ÖLÇÜM (30.08) ───────────────────────────────────────────────────────────
  11 operasyon ekranı aynı üç satırı elle yazıyordu (`LinearGradient` + mutlak konum + aynı
  dolgular; üç dosyada BİREBİR aynı stil bloğu ölçüldü). Gradyan zaten tek token'dı
  (`gradient.stickyFade`), eksik olan çerçeveydi.

  ── IŞIMA ÇUBUĞUN İŞİ, DÜĞMENİN DEĞİL ───────────────────────────────────────
  v3 tasarımında sert gölge YOK (ölçüldü: v2'de 3, v3'te 0). Tek gölge benzeri şey
  `0 4px 14px rgba(95,122,44,.24)` ve dördünün dördü de yapışkan çubuktaki OKUTMA düğmesinde.
  Yani ışıma bir düğme süsü değil, bir KONUM işareti: "bu düğme sayfanın üstünde yüzüyor".
  Anlamı konumdan geldiği için burada duruyor — `PrimaryButton`a konsaydı, sayfa akışının
  içindeki her zeytin düğme de ışırdı ve işaret anlamını kaybederdi.

  Işıma İSTEĞE BAĞLI (`glow`): tasarımda mürekkep dolgulu yapışkan CTA'lar ("Seferi kapat")
  ışımıyor — zeytin ışıması zeytin dolgudan doğar, mürekkebin altında yabancı durur.
*/

interface OperationsStickyBarProps {
  children: ReactNode;
  /** Zeytin dolgulu okutma CTA'sının yumuşak ışıması; mürekkep dolguda VERİLMEZ. */
  glow?: boolean;
  testID?: string;
}

export function OperationsStickyBar({ children, glow = false, testID }: OperationsStickyBarProps) {
  return (
    <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.bar} testID={testID}>
      {/* Işıma sarmalayıcının kutusundan çizilir; yarıçapı düğmeninkiyle AYNI olmak zorunda,
          yoksa yuvarlak düğmenin çevresinde köşeli bir hale görünür. */}
      <View style={glow ? styles.glow : null}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  glow: {
    borderRadius: operationsTheme.radius.control,
    boxShadow: operationsTheme.shadow.glow,
  },
});
