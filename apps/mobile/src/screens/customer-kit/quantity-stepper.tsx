import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';

/*
  ADET SAYACI — sepet satırı, hazır paket satırı ve (sonraki etapta) ürün detayının yapışkan barı.
  Üç yerde de aynı üçlü: `−` · sayı · `+`.

  İKİ ZEMİN çünkü sayaç iki farklı yüzeyde duruyor (v3:440 ve v3:420):
  · `sand` — kum kartın üstünde: dolgu `sand-300`, işaretler zeytin
  · `ink`  — koyu paket kartının üstünde: şablon %12 krem bir dolgu kullanıyor, o alfada bir token
    YOK (envanterde en açık krem %90). Dolgu yerine ince nötr çerçeve çizildi: aynı işi (sayacı
    karttan ayırmak) yapıyor ve palete uydurma bir renk eklemiyor. İhtiyaç raporlandı.

  İŞARETLER METİNDİR, İKON DEĞİL: şablonda da öyle (`−`/`+` karakterleri, Karla 400/19px) —
  ikona çevirmek çizgi kalınlığını ve optik ağırlığı değiştirirdi.

  ERİŞİLEBİLİRLİK: iki düğmenin de ADI çağırandan gelir ("Ürün 1 adedini artır") çünkü ekran
  okuyucuda yan yana duran altı "artır" düğmesi hangisinin hangi satıra ait olduğunu söylemez.
  Sayının kendisi de okunur (`accessibilityLabel` yok, düz metin — satırın parçası olarak geçer).
*/

interface QuantityStepperProps {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  /** "Ürün 1 adedini azalt" — i18n üstte çözülür, satır adını İÇERİR. */
  decreaseLabel: string;
  increaseLabel: string;
  tone?: 'sand' | 'ink';
  testID?: string;
}

export function QuantityStepper({
  quantity,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
  tone = 'sand',
  testID,
}: QuantityStepperProps) {
  const isInk = tone === 'ink';

  return (
    <View style={[styles.row, isInk ? styles.inkRow : styles.sandRow]} testID={testID}>
      <PressableSurface
        onPress={onDecrease}
        feedback="scale-small"
        compact
        style={styles.button}
        accessibilityLabel={decreaseLabel}
        testID={testID === undefined ? undefined : `${testID}-decrease`}
      >
        <Text style={[styles.glyph, isInk ? styles.inkGlyph : styles.sandGlyph]}>−</Text>
      </PressableSurface>
      <Text style={[styles.quantity, isInk ? styles.inkQuantity : styles.sandQuantity]}>{quantity}</Text>
      <PressableSurface
        onPress={onIncrease}
        feedback="scale-small"
        compact
        style={styles.button}
        accessibilityLabel={increaseLabel}
        testID={testID === undefined ? undefined : `${testID}-increase`}
      >
        <Text style={[styles.glyph, isInk ? styles.inkGlyph : styles.sandGlyph]}>+</Text>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Şablon 14'lük köşe çiziyor; resmî set kontrol kademesini 16'da tutuyor (katalogla aynı karar).
    borderRadius: theme.radius.control,
  },
  sandRow: { backgroundColor: theme.colors['sand-300'] },
  inkRow: {
    // Koyu kartın üstünde dolgu yerine çizgi — gerekçe künyede.
    borderWidth: theme.border.hairline,
    borderColor: theme.colors['neutral-400'],
  },
  button: {
    // Şablon: 34×36. Genişlik `stepButton` durağıyla birebir; yükseklik dokunma payıyla
    // (compact) 44'e tamamlanıyor, yani görsel ölçü tasarımın, dokunma hedefi HIG'in.
    width: theme.size.stepButton,
    height: theme.size.stepButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: theme.font.body[400],
    // Şablon 19; ölçekte tam karşılığı yok, en yakın durak `icon-sm` (20).
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
  },
  sandGlyph: { color: theme.colors.olive },
  inkGlyph: { color: theme.colors['sand-50'] },
  quantity: {
    minWidth: theme.space['6xl'],
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
  },
  sandQuantity: { color: theme.colors.ink },
  inkQuantity: { color: theme.colors['sand-50'] },
}));
