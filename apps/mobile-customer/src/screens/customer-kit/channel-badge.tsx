import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  TESLİM ŞEKLİ ROZETİ (Musteri Mobil `shAddr` öneri satırı, 21.313) — bir posta kodunun bize göre
  cevabı: kapıya teslim (zeytin) ya da kargo (nötr). Web'in `ChannelBadge`ının telefondaki karşılığı.
  KARAR ÇAĞIRANDA verilir (bölge listesinden — `use-door-codes.hook`); rozet yalnız çizer.

  Tasarım satırda yalnız METİN taşıyor; web masaüstü v1'deki kamyon/koli ikonu burada yok (telefonda
  native çizim geçerli — kullanıcı kararı 14.09).
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
