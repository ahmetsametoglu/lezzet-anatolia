import { useState } from 'react';
import { StyleSheet as RNStyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { DASH_PATTERN } from './dashed-rule';
import { operationsTheme } from '@/theme/unistyles';

/*
  KESİKLİ ÇERÇEVE — "burada bir şey yok ama olabilir" diyen kutunun kenarı: "+ Siparişsiz mal
  geldi", "+ Başka koli boyu", "say →", imza alanı, kuryenin araç kartı.

  ── NİÇİN `borderStyle: 'dashed'` DEĞİL (ölçüldü 30.08, kurye şeridi + görsel ajanı) ─
  RN'in `dashed`i cihazda tasarımın desenini çizmiyor ve fark AYRAÇTAKİNDEN ÇOK DAHA BÜYÜK:

      cihaz  (RN `borderStyle: 'dashed'`)   çizgi 2–3 px · boşluk 22–33 px · **~1 : 10**
      tasarım (CSS `1.5px dashed`)          çizgi ~9 px  · boşluk ~9 px    · **~1 : 1**

  Ölçüm sefer künyesindeki araç kartının üst kenarından: **840 px'lik yolda yalnız 9 kesik.**
  Uzaktan çerçeve kesikli değil NOKTALI görünüyor — yani tasarımın cümlesi cihazda hiç kurulmuyor.
  Ayraçtaki oran (%60 seyrek) yanında bu bir kademe değil, başka bir çizim.

  `borderStyle: 'dashed'` desen parametresi ALMIYOR. Çare ayraçla aynı: deseni `react-native-svg`
  çizer ve ölçüler TEK yerde durur — kesik dili iki komponente bölünmesin diye `DASH_PATTERN`
  `dashed-rule`dan geliyor (aynı tasarım, aynı tuval ölçeği; iki sabit bir gün ayrışırdı).

  ── ÇERÇEVE ÖRTÜDÜR, KUTU DEĞİL ─────────────────────────────────────────────
  Komponent mutlak konumda, dokunuşa kapalı bir katman: kabın kendi `borderWidth`i DURUR (rengi
  saydam olur) ki yerleşim kaymasın — çerçeveyi söküp SVG eklemek, kutunun içindekileri 1,5 dp
  kaydırırdı. SVG dikdörtgeni tam da o kenarlığın ORTA çizgisine oturuyor (`x = kalınlık / 2`),
  yani kesikler kenarlığın durduğu yerde çiziliyor.

  Ölçü `onLayout`tan gelir çünkü SVG mutlak piksel ister: kutunun boyu içeriğinden doğuyor ve
  önceden bilinemez. İlk karede ölçü yok, çerçeve çizilmez — bir kare sonra gelir.
*/

interface OperationsDashedFrameProps {
  /** Kesiklerin rengi — çağıran tonun kendi kenar rengini verir. */
  color: string;
  /** Köşe yarıçapı; kabın `borderRadius`ıyla AYNI olmalı, yoksa çerçeve köşede kutudan ayrılır. */
  radius: number;
  testID?: string;
}

export function OperationsDashedFrame({ color, radius, testID }: OperationsDashedFrameProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const stroke = operationsTheme.border.base;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // Aynı ölçüde yeniden yazmak gereksiz bir çizim turu açar (kutu her içerik değişiminde ölçülür).
    setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
  };

  return (
    <View
      style={RNStyleSheet.absoluteFill}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {size.width === 0 || size.height === 0 ? null : (
        <Svg width={size.width} height={size.height}>
          <Rect
            x={stroke / 2}
            y={stroke / 2}
            width={Math.max(0, size.width - stroke)}
            height={Math.max(0, size.height - stroke)}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={DASH_PATTERN}
          />
        </Svg>
      )}
    </View>
  );
}
