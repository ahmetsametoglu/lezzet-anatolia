import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  BAŞLIK ÇUBUĞU — 11 ekranda. Sol yuvada geri düğmesi, ortada başlık, sağ yuvada ekranın kendi
  eylemi (paylaş / ilerleme / rozet / "+ Yeni") durur. İkisi de YUVA (`ReactNode`): çubuk hangi
  içeriğin geleceğini bilmez, yalnız hizayı ve kademeyi garanti eder.

  YAPIŞKANLIK EKRANIN İŞİDİR: RN'de `position: sticky` yok — çubuk kaydırma alanının DIŞINDA
  render edilir, bu komponent yalnız çubuğun kendisidir.

  Üst güvenli alan çubuğun içinde: `rt.insets.top` kadar üst dolgu eklenir; ayrı bir
  SafeAreaView sarmalayıcısı gerekmez ve durum çubuğu ile başlık çakışmaz.

  BULANIKLIK YOK: tasarım yarı saydam krem + `backdrop-filter:blur(8px)` çiziyor; RN'de gerçek
  bulanıklık ayrı bir paket ister (expo-blur) ve o yarı saydam kremin token'ı YOK. Opak kum
  kademesiyle uygulandı — ikisi de raporlandı.
*/

interface AppBarProps {
  /** Ekran başlığı — i18n üstte çözülür. */
  title: string;
  /** Sol yuva: genellikle `BackButton`; sekme köklerinde boş bırakılır. */
  left?: ReactNode;
  /** Sağ yuva: paylaş düğmesi, ilerleme sayacı, "+ Yeni" gibi ekrana özel eylem. */
  right?: ReactNode;
  testID?: string;
}

export function AppBar({ title, left, right, testID }: AppBarProps) {
  return (
    <View style={styles.bar} testID={testID}>
      {left}
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingTop: rt.insets.top + theme.space.md,
    paddingBottom: theme.space.md,
    paddingHorizontal: theme.space['2xl'],
    backgroundColor: theme.colors['sand-50'],
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors.ink,
  },
  title: {
    flex: 1,
    fontFamily: theme.font.display,
    fontSize: theme.text['screen-title'],
    fontWeight: theme.text['screen-title--font-weight'],
    color: theme.colors.ink,
  },
}));
