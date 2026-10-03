import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  Posta kodunun teslim şekli: kapıya teslim (zeytin) ya da kargo (nötr); kararı çağıran bölge listesinden verir, rozet yalnız
  çizer. Masaüstündeki kamyon ve koli ikonu yok, çünkü telefon tasarımı satırda yalnız metin taşır.
*/

interface ChannelBadgeProps {
  /** `true` = aracımızın gittiği bölgede (kapıya teslim); `false` = kargo. */
  door: boolean;
  label: string;
  testID?: string;
}

export function ChannelBadge({ door, label, testID }: ChannelBadgeProps) {
  return (
    <View style={[styles.badge, door ? styles.door : styles.ship]} testID={testID}>
      <Text style={[styles.label, door ? styles.doorLabel : styles.shipLabel]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    flexShrink: 0,
    borderWidth: theme.border.hairline,
    borderRadius: theme.radius.badge,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
  },
  door: { backgroundColor: theme.colors['olive-bg'], borderColor: theme.colors['olive-line'] },
  ship: { backgroundColor: theme.colors['sand-100'], borderColor: theme.colors['sand-250'] },
  label: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text['badge-sm'],
  },
  doorLabel: { color: theme.colors['olive-dark'] },
  shipLabel: { color: theme.colors.body },
}));
