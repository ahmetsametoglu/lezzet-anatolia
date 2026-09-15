import type { CustomerOrderStatus } from '@lezzet/types';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/*
  SİPARİŞ DURUM ROZETİ — sipariş listesinde ve sipariş detayının başlığında (v3:669, 698).

  DURUM KÜMESİ ŞEMADAN (`CustomerOrderStatus`), ekrandan değil: müşteriye görünen altı durak
  `@lezzet/types`ta kapalı bir küme olarak duruyor ve METİN sayfanın `messages.json`'undan gelir
  (enum'un kendi künyesinin hükmü). Böylece bir durak eklendiğinde bu dosya DERLEMEDE kırılır —
  `satisfies Record<CustomerOrderStatus, …>` onu zorluyor.

  NEDEN KİTTEKİ `Tag` DEĞİL: `Tag`in dört tonu (terracotta · ink · cream · sand) durum ailesini
  taşımıyor — durum rozeti YUMUŞAK zeminli ve KOYU yazılıdır (zeytin zemin/koyu zeytin yazı),
  `Tag` ise dolu zeminli ve ters yazılı. İkisini tek komponentte birleştirmek `Tag`e "yumuşak"
  diye ikinci bir eksen eklemek olurdu.

  ZEMİN/YAZI ÇİFTLERİ tasarımın kendi tablosundan (v3:1961 `stC`) token karşılıklarıyla:
  · alındı        → zeytin ailesi (olumlu, başladı)
  · hazırlanıyor  → terracotta ailesi (devam ediyor, dikkat)
  · yolda         → terracotta ailesi (aynı aile: ikisi de "süreç işliyor")
  · teslim edildi → kapanmış ailesi (nötr; iş bitti, vurgu istemiyor)
  · iptal         → hata ailesi
  · iade sürüyor  → ŞABLONDA YOK (v3 bu durağı hiç çizmiyor). Terracotta ailesine bağlandı çünkü
    devam eden bir süreçtir; kapanmış ailesine koymak bitmiş gibi okuturdu.
*/

type StatusTone = 'olive' | 'terracotta' | 'closed' | 'error';

const STATUS_TONES = {
  received: 'olive',
  preparing: 'terracotta',
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
  olive: { backgroundColor: theme.colors['olive-bg'] },
  oliveLabel: { color: theme.colors['olive-dark'] },
  terracotta: { backgroundColor: theme.colors['terracotta-bg'] },
  terracottaLabel: { color: theme.colors.terracotta },
  closed: { backgroundColor: theme.colors['closed-bg'] },
  closedLabel: { color: theme.colors.closed },
  error: { backgroundColor: theme.colors['error-bg'] },
  errorLabel: { color: theme.colors.error },
}));
