import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { MePointsView } from '@/lib/api/points';
// Yalnız metin bloğunun tipi için: komponent sözlüğü okumaz, çağıran geçirir.
import type accountMessages from '@lezzet/i18n/customer/account';

type PointsCopy = LocalizedCopy<typeof accountMessages>['points'];

/** "Kopyalandı" etiketinin ekranda kaldığı süre (ms). */
const COPIED_MS = 2000;

interface CouponRowProps {
  coupon: MePointsView['coupons'][number];
  copy: PointsCopy;
  locale: Locale;
  testID?: string;
}

export function CouponRow({ coupon, copy, locale, testID }: CouponRowProps) {
  const { theme } = useUnistyles();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const value =
    coupon.amountCents === null
      ? copy.couponPercent.replace('{n}', String(coupon.percent ?? 0))
      : copy.couponValue.replace('{value}', formatPrice(coupon.amountCents, locale));
  // Asgari sepet yazılır, çünkü sepette reddedilecek kuponu koşulsuz göstermek yanıltır.
  const minBasket =
    coupon.minBasketCents === null ? null : copy.couponMinBasket.replace('{amount}', formatPrice(coupon.minBasketCents, locale));

  const copyCode = () => {
    void Clipboard.setStringAsync(coupon.code).then((ok) => {
      // Başarısız yazımda cümle açılmaz: kod ekranda okunur durduğu için elle yapılabilen işi arıza gibi göstermek olurdu.
      if (!ok) return;
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    });
  };

  return (
    <View style={styles.row} testID={testID}>
      <Icon name="coupon" size={theme.size.inlineIcon} color={theme.colors.terracotta} />
      <Text style={styles.code}>{coupon.code}</Text>
      <Text style={styles.value}>{minBasket === null ? value : `${value} · ${minBasket}`}</Text>
      <TextAction
        label={copied ? copy.couponCopied : copy.couponCopy}
        onPress={copyCode}
        testID={testID === undefined ? undefined : `${testID}-copy`}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    backgroundColor: theme.colors.card,
    borderWidth: theme.border.hairline,
    borderStyle: 'dashed',
    borderColor: theme.colors['olive-line'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['2xl'],
  },
  code: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.terracotta,
  },
  value: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
