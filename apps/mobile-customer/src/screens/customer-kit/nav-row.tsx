import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';

/*
  Geçiş satırı ("ikon · başlık · ›"); ayraç satırın kendisinde (`divider`), çünkü ayrı bir ayraç öğesi listenin ilk öğesini bilme
  sorumluluğunu her çağırana dağıtırdı. İşaret metindir ve ekran okuyucuya gitmez, çünkü satırın adı başlığıdır.
*/

interface NavRowProps {
  label: string;
  onPress: () => void;
  /** Sol yuva — genellikle bir ikon. */
  icon?: ReactNode;
  /** Üstünde kesikli ayraç çizilsin mi (listenin ilk satırı hariç hepsi). */
  divider?: boolean;
  /** Sağdaki işaretin yerine geçen içerik (ör. seçili değer). Verilmezse `›`. */
  trailing?: ReactNode;
  testID?: string;
}

export function NavRow({ label, onPress, icon, divider = false, trailing, testID }: NavRowProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="tint"
      style={[styles.row, divider ? styles.divider : undefined]}
      accessibilityLabel={label}
      testID={testID}
    >
      {icon}
      <Text style={styles.label}>{label}</Text>
      {trailing ?? (
        <View style={styles.chevronBox}>
          <Text style={styles.chevron}>›</Text>
        </View>
      )}
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    // Şablon: `padding:15px 16px` — 15 ölçekte ara değer, en yakın durağa çekildi.
    paddingVertical: theme.space['3xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  divider: {
    borderTopWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  label: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.ink,
  },
  chevronBox: {
    // İşaretin optik hizası: tek karakter kendi satır kutusunda yukarıda durur.
    justifyContent: 'center',
  },
  chevron: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['icon-sm'],
    lineHeight: theme.text['icon-sm'],
    color: theme.colors['sand-600'],
  },
}));
