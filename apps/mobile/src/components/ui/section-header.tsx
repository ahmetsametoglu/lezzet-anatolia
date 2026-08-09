import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { TextAction } from './text-action';
import { emToDp } from '../../theme/parse';

/*
  BÖLÜM BAŞLIĞI — v3'te ~16 kullanım, üç kademeli kullanım: yalnız üstbaşlık ⟷ üstbaşlık +
  Lora başlık ⟷ ikisi + sağda bağlantı. Üstbaşlık uygulamanın kendi kademesidir
  (10px/700/.18em terracotta) — tabandaki `eyebrow`i kompozisyonda uygulama eziyor.

  HARF ARALIĞI: token `em` cinsindendir (kademe değişirse aralık da değişsin diye), RN mutlak
  dp ister; çeviri `emToDp` ile TEK yerden yapılır.
*/

interface SectionHeaderProps {
  /** Üstbaşlık — büyük harfe komponent çevirir, metin i18n'den gelir. */
  eyebrow: string;
  /** İsteğe bağlı Lora başlık. */
  title?: string;
  /** Sağdaki bağlantı; ikisi birlikte verilir. */
  actionLabel?: string;
  onActionPress?: () => void;
  testID?: string;
}

export function SectionHeader({ eyebrow, title, actionLabel, onActionPress, testID }: SectionHeaderProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.stack}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        {title === undefined ? null : (
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        )}
      </View>
      {actionLabel !== undefined && onActionPress !== undefined ? (
        <TextAction label={actionLabel} onPress={onActionPress} tone="terracotta" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.xl,
  },
  stack: {
    flex: 1,
    gap: theme.space['2xs'],
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: emToDp(theme.text['eyebrow--letter-spacing'], theme.text.eyebrow),
    textTransform: 'uppercase',
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['h2-sm--font-weight']],
    // Tasarım bu başlığı 21 px çiziyor; token'da o durak YOK, bölüm başlığının mobil kademesi
    // `h2-sm` (20). Ham değer kodlanmadı — 21'lik durak raporlandı.
    fontSize: theme.text['h2-sm'],
    color: theme.colors.ink,
  },
}));
