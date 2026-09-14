import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  İŞ SÜRERKEN ÖRTÜ (tasarım: `yukleniyor`) — ekranın tamamını krem camla örter; altındaki düğmeler basılmaz,
  çift istek doğmaz. Halka kitin yükleniyor halkası (giriş boyu 40; tasarımın 34'ü halka ailesinde durak değil),
  cümle hangi işin sürdüğünü söyler. Zemin `cream-glass`: sayfanın kremine Δ1/1/6, opaklık .96 (tasarım .95).
*/

interface BusyOverlayProps {
  label: string;
}

export function BusyOverlay({ label }: BusyOverlayProps) {
  return (
    <View style={styles.overlay} testID="login-busy">
      <LoadingState size="md" accessibilityLabel={label} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors['cream-glass'],
  },
  label: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.olive,
  },
});
