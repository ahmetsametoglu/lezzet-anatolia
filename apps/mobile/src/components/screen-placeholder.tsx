import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

interface ScreenPlaceholderProps {
  /** Ekran adı — tasarım hattı bağlanana kadar tek içerik. */
  title: string;
}

// Tasarımsız yer tutucu: görsel karar YOK (yalnız yerleşim; renk/tipografi token seti 21.3'te).
export function ScreenPlaceholder({ title }: ScreenPlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header">{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
