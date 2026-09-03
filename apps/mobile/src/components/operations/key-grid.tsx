import { useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  TUŞ IZGARASI — tuş takımlarının ORTAK gövdesi (03.09).

  ── NEDEN AYRILDI ───────────────────────────────────────────────────────────
  Izgara `keypad-panel`in içindeydi ve o panel bir SAYI modeli taşıyor (ondalık, tavan, "beklenen"
  çipi). İkinci tuş takımı (tarih: altı rakam, maske) o modeli istemiyor ama tuşları birebir aynı
  istiyor — aynı boy, aynı ölçüm, aynı sil tuşu. Izgarayı ikinci kez yazmak, tuş boyunu iki yerde
  değiştirmek olurdu (CLAUDE §1). Bu dosya yalnız TUŞLARI bilir: hangi tuşlar var, basılınca ne
  söylenir. Değerin ne olduğu çağıranın işi.

  ── KAP ÖLÇÜLÜR, YÜZDE KULLANILMAZ (cihazda ölçüldü 02.09) ─────────────────
  Izgara `flexBasis: '30%'` ile yazılmıştı ve para çekmecesinde çalışıyordu; ADET çekmecesinin
  içine adım olarak konunca on bir tuşun HEPSİ tek satıra ince şeritler hâlinde dizildi. Yüzde,
  kabın genişliği KESİN olduğunda çözülür; çekmecenin kaydırma kabında her zaman öyle değil.
  Ölçüm varsayımsız tek yol: genişliği al, iki boşluğu düş, üçe böl. Sil tuşu değerin sağında
  durduğu için (kullanıcı 02.09) aynı genişliği çağırana da söyler (`onKeyWidth`).
*/

interface OperationsKeyGridProps {
  /** Tuşların dizilişi — üç sütun, satır satır. Para: `1…9 , 0 00` · tarih: `1…9 0`. */
  keys: readonly string[];
  onKey: (key: string) => void;
  /** Ölçülen tuş genişliği — çağıran sil tuşunu aynı boyda çizer. */
  onKeyWidth?: (width: number) => void;
  testID?: string;
}

export function OperationsKeyGrid({ keys, onKey, onKeyWidth, testID }: OperationsKeyGridProps) {
  const [gridWidth, setGridWidth] = useState(0);
  const keyWidth = gridWidth === 0 ? null : (gridWidth - 2 * operationsTheme.space.md) / 3;

  return (
    <View
      style={styles.grid}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setGridWidth(width);
        onKeyWidth?.((width - 2 * operationsTheme.space.md) / 3);
      }}
    >
      {keys.map((key) => (
        <PressableSurface
          key={key}
          onPress={() => onKey(key)}
          feedback="scale"
          style={[styles.key, keyWidth === null ? null : { width: keyWidth }]}
          accessibilityLabel={key}
          testID={testID === undefined ? undefined : `${testID}-key-${key}`}
        >
          <Text style={styles.keyLabel}>{key}</Text>
        </PressableSurface>
      ))}
    </View>
  );
}

interface OperationsKeypadDeleteProps {
  onPress: () => void;
  label: string;
  /** Izgaradan ölçülen tuş genişliği; ölçüm gelene kadar kare. */
  width: number | null;
  testID?: string;
}

/** SİL tuşu — değerin sağında, ızgaradaki tuşlarla aynı genişlikte (kullanıcı kararı 02.09). */
export function OperationsKeypadDelete({ onPress, label, width, testID }: OperationsKeypadDeleteProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale"
      compact
      style={[styles.delete, width === null ? null : { width }]}
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name="backspace" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.md,
    marginTop: operationsTheme.space.xl,
  },
  /*
    ÜÇ SÜTUNLUK IZGARA — `flexShrink` SIFIR olmak ZORUNDA (arıza, cihazda görüldü 30.08).

    Eski hâl `width: 33.33% + flexBasis: 33.33% + flexShrink: 1`di ve tuşlar SARMIYOR, tek satıra
    sıkışıyordu. Sebep Yoga'nın kuralı — sarmalı bir kapsayıcıda küçülebilen öğe önce küçülür,
    sonra sarar; `flexShrink: 1` verildiği sürece satır hiçbir zaman taşmaz, sarma hiç tetiklenmez.
    Genişlik ölçülen kaptan gelir; `flexShrink: 0` ölçüm gelene kadarki ilk karede tuşlar içeriğe
    daralmasın diye duruyor.
  */
  key: {
    flexShrink: 0,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  keyLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['card-title-sm'],
    color: operationsTheme.colors.ink,
  },
  delete: {
    width: operationsTheme.size.controlLg,
    height: operationsTheme.size.controlLg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
});
