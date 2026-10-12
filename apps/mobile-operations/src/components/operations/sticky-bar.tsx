import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native-unistyles';

import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  Yapışkan eylem çubuğu: listenin altında durur, sayfayla kaymaz. Gradyan, konum ve dolgular tek yerdedir ki ekranlar aynı çubuğu
  elle yeniden yazmasın; ışıma düğmenin kendi imzasıdır (`PrimaryButton elevation="glow"`), çubuğun değil.
*/

const BAR_PAD_TOP = operationsTheme.space.xl;
const BAR_PAD_BOTTOM = operationsTheme.space['3xl'];

/** Tek `controlLg` düğme taşıyan çubuğun boyu; çubuğun üstüne kalkan yüzen düğme (`lift`) bunu okur. */
export const STICKY_BAR_HEIGHT = BAR_PAD_TOP + operationsTheme.size.controlLg + BAR_PAD_BOTTOM;

interface OperationsStickyBarProps {
  children: ReactNode;
  /**
   * Çubuğun ölçülen yüksekliği: çubuk mutlak konumlu olduğu için listenin son kartını örter. İçeriği değişken çubukta (dipnot,
   * kapı metni) ölçüm formülü yener, çünkü metin uzayınca ya da yazı ölçeği büyüyünce formül sessizce yanlış olur.
   */
  onHeight?: (height: number) => void;
  testID?: string;
}

export function OperationsStickyBar({ children, onHeight, testID }: OperationsStickyBarProps) {
  return (
    <LinearGradient
      {...operationsTheme.gradient.stickyFade}
      style={styles.bar}
      onLayout={onHeight === undefined ? undefined : (e) => onHeight(e.nativeEvent.layout.height)}
      testID={testID}
    >
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
    /* Çubuk birden çok öğe taşıyabilir (kapı metni, birincil düğme, kısmi kayıt); aralıksız iki düğme tek blok gibi okunur. */
    gap: operationsTheme.space.lg,
    paddingTop: BAR_PAD_TOP,
    paddingBottom: BAR_PAD_BOTTOM,
    paddingHorizontal: operationsTheme.space['5xl'],
  },
});
