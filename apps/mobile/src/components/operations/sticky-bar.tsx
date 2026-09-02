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
  /**
   * **Çubuğun ÖLÇÜLEN yüksekliği** (kullanıcı bulgusu 01.09) — listenin altına ne kadar boşluk
   * bırakılacağını söyler.
   *
   * Çubuk mutlak konumlu, yani listenin son kartını ÖRTER. Ekranlar bunu bugüne dek bir formülle
   * telafi ediyordu (`size.controlLg + space['8xl']`, yani "düğme + biraz") ve formül çubuğun
   * gerçek içeriğini bilmiyor: rota seçiminde düğmenin altında üç satırlık bir dipnot da var ve
   * "Araca alınacaklar" özeti bu yüzden düğmenin ARKASINDA kalıyordu — kullanıcı ekranda yarısı
   * kesilmiş bir kart gördü.
   *
   * Ölçüm formülü yener çünkü içerik değişkendir: dipnot metni uzayınca, dil değişince ya da
   * yazı tipi ölçeği büyüyünce formül sessizce yanlış olur, ölçüm olmaz.
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
    /* ÇOCUKLAR ARASINDA BOŞLUK (eksikti — kullanıcı bulgusu 30.08): çubuk birden çok öğe
       taşıyabiliyor (kapı metni · birincil düğme · kısmi kayıt düğmesi + notu) ve `gap`
       olmadığı için hepsi bitişik çiziliyordu — iki düğme tek bir blok gibi görünüyordu.
       Tasarımın yapışkan tabanında öğeler ayrık duruyor (`02c-SKT-Cekmecesi` karesi). */
    gap: operationsTheme.space.lg,
    paddingTop: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['5xl'],
  },
});
