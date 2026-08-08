import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { PressableSurface } from '@/components/ui/pressable-surface';
import { CustomerIcon } from './customer-icon';

/*
  YÜZEN SEPET DÜĞMESİ (v3:1302) — sepet bir SEKME DEĞİL; vitrinden ve katalogdan ona bu düğmeyle
  gidilir. Şablonun kuralı aynen: sepet BOŞKEN hiç çizilmez (boş bir sepete davet etmenin anlamı
  yok), doluyken sağ altta durur ve adedi rozetle söyler.

  Düğme KENDİNİ KONUMLANDIRMAZ: nerede duracağı ekranın yerleşim kararıdır (sekme çubuğunun mu,
  yapışkan bir barın mı üstünde) ve şablonda da ekrana göre değişiyor (84 ⟷ 112 px). Komponent
  yalnız daireyi, ikonu ve rozeti çizer.

  ÖLÇÜ: şablon 58 dp çiziyor; ölçü katmanında o durak YOK (bu etapta `theme/metrics.ts` yazıya
  kapalı) — en yakın durak 56. Fark 2 dp, dokunma hedefinin çok üstünde; ihtiyaç raporlandı.
  Gölge de aynı sebeple resmî `hard` (3 px): şablonun 4 px'lik varyantı token değil.
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
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.card,
  },
}));
