import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { customerMetrics } from './customer-metrics';

/*
  AÇMA/KAPAMA ANAHTARI (v3:882) — hesap ekranındaki kampanya iletişimi tercihleri.

  RN'İN KENDİ `Switch`İ KULLANILMADI: platformun anahtarı iOS'ta yeşil, Android'de Material
  renklerini alır ve tasarımın zeytin/kum çiftini ancak kısmen kabul eder (iOS'ta kapalı hâlin
  zemini sistemden gelir, boyanamaz). v3'ün anahtarı iki platformda AYNI görünmeli.

  DURUM EKRAN OKUYUCUYA `switch` ROLÜYLE gider: renk farkı ekran okuyucuya ulaşmaz.
  `PressableSurface` bugün `switch` rolünü tanımıyor (kit üç rol alıyor: button · link · tab) —
  bu yüzden rol `button`, durum ise `selected` ile bildiriliyor; ikisi de doğru okunur ama
  `switch` rolü kite eklendiğinde buraya geçmeli. İhtiyaç raporlandı.
*/

interface ToggleSwitchProps {
  value: boolean;
  onToggle: () => void;
  /** Neyin açılıp kapandığı ("E-posta kampanya iletişimi") — i18n üstte çözülür. */
  accessibilityLabel: string;
  testID?: string;
}

export function ToggleSwitch({ value, onToggle, accessibilityLabel, testID }: ToggleSwitchProps) {
  return (
    <PressableSurface
      onPress={onToggle}
      feedback="scale-small"
      compact
      selected={value}
      style={[styles.track, value ? styles.on : styles.off]}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={[styles.knob, value ? styles.knobOn : styles.knobOff]} />
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    width: customerMetrics.switchWidth,
    height: customerMetrics.switchHeight,
    borderRadius: customerMetrics.switchHeight / 2,
    justifyContent: 'center',
  },
  on: { backgroundColor: theme.colors.olive },
  off: { backgroundColor: theme.colors['sand-500'] },
  knob: {
    width: customerMetrics.switchKnob,
    height: customerMetrics.switchKnob,
    borderRadius: customerMetrics.switchKnob / 2,
    backgroundColor: theme.colors.card,
    boxShadow: theme.shadow.soft,
  },
  /* Topuz kenardan kenara: yol içindeki boşluk (30 − 24) / 2 = 3 dp. Hesap tek yerde durur ki
     iki uç aynı payı alsın; elle iki değer yazmak bir gün asimetri doğururdu. */
  knobOn: { alignSelf: 'flex-end', marginRight: (customerMetrics.switchHeight - customerMetrics.switchKnob) / 2 },
  knobOff: { alignSelf: 'flex-start', marginLeft: (customerMetrics.switchHeight - customerMetrics.switchKnob) / 2 },
}));
