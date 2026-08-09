import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { operationsTheme } from '@/theme/unistyles';

/*
  BİLDİRİM DÜĞMESİ — üç bölüm kökünün sağ üst köşesi (v2:41 kurye · 272 depo · 491 yönetim).
  42 dp nötr daire + zil ikonu + köşede sayaç rozeti. PARA bölümünde YOKTUR (orada metin eylemi
  var), bu yüzden başlığın sabit parçası değil `right` yuvasına verilen bir öğedir.

  SAYAÇ SIFIRDA ÇİZİLMEZ (v2 `bilN: bil.length || null`): boş bir rozet "0 yeni" demez, "bir şey
  var" der. Sayı ROL SÜZMESİNDEN SONRAKİ sayıdır — kullanıcı açamayacağı bir işin sayısını taşımaz.

  A11Y: rozet görsel bir işarettir, ekran okuyucuya SAYIYLA BİRLİKTE tek bir ad gider
  ("Bildirimler, 3 yeni"); metni i18n üstte kurar, komponent metin gömmez. Rozetin kendisi
  `Text` olduğu için ayrıca okunmasın diye düğmenin adı tek kaynaktır.
*/

interface NotificationBellProps {
  onPress: () => void;
  /** Ekran okuyucu adı — sayı dahil, i18n üstte çözülür. */
  accessibilityLabel: string;
  /** Süzülmüş bildirim sayısı; 0 ise rozet çizilmez. */
  count: number;
  testID?: string;
}

export function NotificationBell({ onPress, accessibilityLabel, count, testID }: NotificationBellProps) {
  return (
    <PressableSurface
      onPress={onPress}
      feedback="scale-small"
      style={styles.button}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Icon name="bell" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
      {count > 0 ? (
        <View style={styles.badge} testID={testID === undefined ? undefined : `${testID}-badge`}>
          <Text style={styles.badgeLabel}>{count}</Text>
        </View>
      ) : null}
    </PressableSurface>
  );
}

const styles = StyleSheet.create({
  button: {
    width: operationsTheme.size.iconButtonOnPhoto,
    height: operationsTheme.size.iconButtonOnPhoto,
    borderRadius: operationsTheme.size.iconButtonOnPhoto / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  badge: {
    position: 'absolute',
    // v2: `top:-2px; right:-2px` — rozet dairenin dışına taşar.
    top: -operationsTheme.space['2xs'],
    right: -operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.sm,
    /* v2 dikey dolgusu 1 px; ölçekte yok ve YUVARLANMADI: 2 dp'lik `2xs` rozetin yüksekliğini
       yalnız 2 px büyütür ve hap biçimi korunur. */
    paddingVertical: operationsTheme.space['2xs'],
    /* v2: `border-radius:9px`. Resmî sette 9 yok — gerek de yok: yarıçap kutunun yarısında
       kırpılır, yani `pill` (22) bu boyda tam hap çizer (`operations-app.ts`in açık hükmü). */
    borderRadius: operationsTheme.radius.pill,
    backgroundColor: operationsTheme.colors.terracotta,
  },
  badgeLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['badge--font-weight']],
    // v2: `700 10px` — rozetin küçük kademesi (`badge-sm`), aralığı yok (tek sayı).
    fontSize: operationsTheme.text['badge-sm'],
    // Dolu rozet üstünde beyaz: tabandaki `card` tam olarak #ffffff (`operations-app.ts` eşlemesi).
    color: operationsTheme.colors.card,
  },
});
