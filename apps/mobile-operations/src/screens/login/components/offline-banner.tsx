import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

import { loginCopy } from '../copy';

/*
  BAĞLANTI BANDI (tasarım: `cevrimdisi`) — ekranın en üstünde, kaydırmanın dışında. Tetik son isteğin ağa hiç
  çıkamaması (`offline`); cihazın ağ durumunu sürekli izleyen bir kaynak YOK — `netinfo` bağımlılıklarda değil
  ve eklemek dev-client derlemesi ister (`screens/warehouse/warehouse-status.ts` emsali). Bant bu yüzden bir
  OLGUYU söyler: az önceki deneme ağa ulaşamadı. Sonraki denemede kalkar.
*/

export function OfflineBanner() {
  return (
    <View style={styles.banner} accessibilityRole="alert" testID="login-offline">
      <Icon name="connection-off" size={operationsTheme.size.inlineIcon} color={operationsTheme.colors.card} />
      <Text style={styles.label}>{loginCopy.offline}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.error,
  },
  label: {
    flex: 1,
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.card,
  },
});
