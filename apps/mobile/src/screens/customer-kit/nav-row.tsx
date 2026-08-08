import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';

/*
  GEÇİŞ SATIRI — "ikon · başlık · ›". Hesap ekranının menü kartı (v3:850-855) dört kez, adres ve
  bilgi listeleri de aynı satırı kullanıyor. Kartın İÇİNDE dururlar: ilk satır hariç hepsinin
  üstünde kesikli bir ayraç vardır.

  AYRAÇ SATIRIN KENDİSİNDE, aralarına serpiştirilen ayrı bir öğede değil: çağıran `divider`
  bayrağını verir. Ayrı bir `<Divider/>` çizmek, listenin ilk öğesini bilme sorumluluğunu her
  çağırana dağıtırdı ve biri bir gün unuturdu.

  İŞARET (›) METİNDİR: şablonda da öyle. Ekran okuyucuya gitmez — satırın kendisi zaten bir
  düğmedir ve adı başlıktır.
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
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  label: {
    flex: 1,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    fontWeight: theme.text['button--font-weight'],
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
