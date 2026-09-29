import type { CustomerOrderStatus } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  Sipariş durum rozeti, liste ve detay başlığında; durum kümesi şemadan gelir ve `satisfies` yeni durağı derlemede yakalar. Kitteki
  `Tag` kullanılmaz, çünkü durum rozeti yumuşak zeminli ve koyu yazılıdır; bekleyen durum bal, süren süreç terracotta ailesindedir.
*/

type StatusTone = 'honey' | 'olive' | 'terracotta' | 'closed' | 'error';

const STATUS_TONES = {
  // Bekleyen durum ailesi: sıradaki hareket müşterinin, ödemeyi tamamlaması.
  awaiting_payment: 'honey',
  received: 'olive',
  preparing: 'terracotta',
  ready_for_pickup: 'terracotta',
  on_the_way: 'terracotta',
  delivered: 'closed',
  cancelled: 'error',
  returning: 'terracotta',
} as const satisfies Record<CustomerOrderStatus, StatusTone>;

interface OrderStatusTagProps {
  status: CustomerOrderStatus;
  /** Durumun okunur adı — sayfanın `messages.json`'undan (üç dil). */
  label: string;
  testID?: string;
}

export function OrderStatusTag({ status, label, testID }: OrderStatusTagProps) {
  const tone = STATUS_TONES[status];

  return (
    // Dönüş dış sarmalayıcıda (kitteki `Tag` ile aynı gerekçe).
    <View style={styles.tilt} testID={testID}>
      <View style={[styles.badge, styles[tone]]}>
        <Text style={[styles.label, styles[`${tone}Label`]]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tilt: { transform: [{ rotate: '2deg' }] },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radius.badge,
  },
  label: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    // Şablon 11,5 yazıyor — ölçekte tam karşılığı `micro`.
    fontSize: theme.text.micro,
  },
  honey: { backgroundColor: theme.colors['honey-bg'] },
  honeyLabel: { color: theme.colors.honey },
  olive: { backgroundColor: theme.colors['olive-bg'] },
  oliveLabel: { color: theme.colors['olive-dark'] },
  terracotta: { backgroundColor: theme.colors['terracotta-bg'] },
  terracottaLabel: { color: theme.colors.terracotta },
  closed: { backgroundColor: theme.colors['closed-bg'] },
  closedLabel: { color: theme.colors.closed },
  error: { backgroundColor: theme.colors['error-bg'] },
  errorLabel: { color: theme.colors.error },
}));
