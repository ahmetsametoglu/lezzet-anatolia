import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { CustomerIcon } from '@lezzet/mobile-kit/src/components/customer/customer-icon';

/*
  Yüzen sepet düğmesi: sepet bir sekme değildir, vitrinden ve katalogdan bu düğmeyle gidilir; boşken hiç çizilmez, doluyken adedi
  rozetle söyler. Düğme kendini konumlandırmaz, çünkü yeri ekranın yerleşim kararıdır; ölçü şablonun 58'i yerine ölçekteki en yakın
  durak 56, gölge de token olan `hard`.
*/

interface CartFabProps {
  /** Sepetteki toplam adet. Sıfırsa düğme HİÇ çizilmez. */
  count: number;
  onPress: () => void;
  /** "Sepeti aç, 3 ürün" — sayıyı İÇEREN tam cümle; i18n üstte çözülür. */
  accessibilityLabel: string;
  testID?: string;
}

export function CartFab({ count, onPress, accessibilityLabel, testID }: CartFabProps) {
  const { theme } = useUnistyles();

  if (count <= 0) return null;

  return (
    <PressableSurface
      onPress={onPress}
      feedback="shadow"
      style={styles.button}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <CustomerIcon name="cart" size={theme.size.tabIcon} color={theme.colors.card} />
      {/* Rozet ekran okuyucuya AYRICA okunmaz: sayı düğmenin kendi adının içinde geçiyor. */}
      <View style={styles.badge} pointerEvents="none">
        <Text style={styles.badgeLabel}>{count}</Text>
      </View>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: theme.size.avatarLg,
    height: theme.size.avatarLg,
    borderRadius: theme.size.avatarLg / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.olive,
    boxShadow: theme.shadow.hard,
  },
  badge: {
    position: 'absolute',
    top: -theme.space.xs,
    right: -theme.space['2xs'],
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.sm,
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors.terracotta,
    // Krem halka rozeti zeytin daireden ayırır (şablon: `border:2px solid #f3efe2`).
    borderWidth: theme.border.base,
    borderColor: theme.colors['sand-50'],
  },
  badgeLabel: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    color: theme.colors.card,
  },
}));
