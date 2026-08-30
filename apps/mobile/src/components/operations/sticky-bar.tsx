import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@/theme/unistyles';

/*
  YAPIŞKAN CTA ÇUBUĞU — listenin altında duran, sayfayla birlikte kaymayan eylem şeridi.

  ── ÖLÇÜM (30.08) ───────────────────────────────────────────────────────────
  11 operasyon ekranı aynı üç satırı elle yazıyordu (`LinearGradient` + mutlak konum + aynı
  dolgular; üç dosyada BİREBİR aynı stil bloğu ölçüldü). Gradyan zaten tek token'dı
  (`gradient.stickyFade`), eksik olan çerçeveydi.

  ── IŞIMA BURADAN ALINDI (kurye şeridinin ölçümü, doğrulandı 30.08) ─────────
  İlk turda çubuğa bir `glow` prop'u konmuş ve gerekçesi *"ışıma bir düğme süsü değil bir KONUM
  işareti"* diye yazılmıştı. **İddia ölçülmemişti ve tersi çıktı:** dört ışımalı düğmenin
  ebeveyni tarandı, dördü de sayfa AKIŞINDA (`margin:0 20px` · `margin:12px 20px 0` · …) ve o iki
  dosyada `position:sticky` hiç geçmiyor. Işıma çubuğa bağlıyken ulaşılamaz bir yerdeydi —
  kurye 16'nın okutma düğmesini kite geçirirken veremedi.

  Işıma artık `PrimaryButton elevation="glow"`: zeytin dolgulu OKUTMA düğmesinin kendi imzası
  (künyesi orada). Bu çubuk yalnız gradyanı, konumu ve dolguları garanti eder.
*/

interface OperationsStickyBarProps {
  children: ReactNode;
  testID?: string;
}

export function OperationsStickyBar({ children, testID }: OperationsStickyBarProps) {
  return (
    <LinearGradient {...operationsTheme.gradient.stickyFade} style={styles.bar} testID={testID}>
      {children}
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
});
