import type { LocalizedCopy, Locale } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { formatOrderDate } from '@/screens/orders/order-format';
import type { UseOrdersResult } from '@/screens/orders/use-orders.hook';
import { isNumbered } from '@/lib/api/orders';
// Sözlük burada YALNIZ tip için okunuyor (metni ekran veriyor): çalışma zamanında ikinci bir JSON
// kopyası taşınmasın diye tip-yalnız import.
import type messages from '@lezzet/i18n/customer/support';

/*
  Yeni talebin sipariş seçicisi; listeyi çekmeceden alır, çünkü çekmece kapsam sorusunu sormadan önce siparişin varlığını bilmek zorunda.
  Sipariş sayısı sınırsız büyür ama bu bir form adımı: sonsuz kaydırma yerine "daha eski siparişler" düğmesi var.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Bekleme iskeleti: üç sipariş satırı, satırın gerçek kabuğuyla kurulur ki yükseklik kendiliğinden çıksın. */
const SKELETON_SLOTS = [0, 1, 2];

interface OrderPickerProps {
  locale: Locale;
  t: Messages;
  /** Sipariş listesi — okuma ÇEKMECEDE, burada değil (künye). */
  orders: UseOrdersResult;
  /** Sipariş seçildi — akış forma geçer. */
  onPick: (reference: string) => void;
  /** Seçilecek sipariş yok / okunamadı — müşteri genel talebe düşer (aynı sorunun "hayır" şıkkı). */
  onGeneral: () => void;
}

export function OrderPicker({ locale, t, orders, onPick, onGeneral }: OrderPickerProps) {
  // Skeleton satır yüksekliklerini yazı kademelerinden türetir (aşağıdaki bekleme dalı).
  const { theme } = useUnistyles();

  if (orders.status === 'loading') {
    return (
      <View
        style={styles.block}
        testID="new-ticket-orders-loading"
        accessible
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
      >
        {SKELETON_SLOTS.map((slot) => (
          <View key={slot} style={styles.orderRow}>
            {/* Solda sipariş numarası, sağda tarih — satırın kendi düzeni. */}
            <Skeleton width="42%" height={theme.text.note * theme.text['h1--line-height']} tone="deep" />
            <Skeleton width="28%" height={theme.text.helper * theme.text['h1--line-height']} tone="deep" />
          </View>
        ))}
      </View>
    );
  }

  /* Misafir ve arıza AYRI cümleler ama aynı çıkış: siparişe bağlanamayan müşteri genel talep
     yazabilmeli — çıkışsız bir oda bırakmıyoruz. Oturum kapısını ekranın kendisi çizmiyor çünkü
     buraya gelen kişi zaten form dolduruyor; gönderim anında 401 gelirse orada söylenir. */
  if (orders.status !== 'ready') {
    return (
      <View style={styles.block} testID="new-ticket-orders-error">
        <Note description={orders.status === 'guest' ? t.new.errors.guest : t.new.order.error} tone="terracotta" />
        {orders.status === 'error' ? (
          <TextAction label={t.error.retry} onPress={orders.retry} tone="terracotta" testID="new-ticket-orders-retry" />
        ) : null}
        <SecondaryButton label={t.new.scope.no} onPress={onGeneral} testID="new-ticket-order-none" />
      </View>
    );
  }

  /* Boş liste dalı yok: siparişi olmayan müşteriye kapsam sorusu sorulmaz, akış doğrudan genel talebe açılır. */
  return (
    <View style={styles.block} testID="new-ticket-orders">
      {/* Ödeme bekleyen siparişin numarası yok; talep numaralı siparişe bağlanır. */}
      {orders.orders.filter(isNumbered).map((order) => (
        <PressableSurface
          key={order.reference}
          onPress={() => onPick(order.reference)}
          feedback="opacity"
          style={styles.orderRow}
          accessibilityLabel={t.new.order.pick.replace('{reference}', order.reference)}
          testID={`new-ticket-order-${order.reference}`}
        >
          <Text style={styles.orderReference}>{order.reference}</Text>
          <Text style={styles.orderDate}>{formatOrderDate(order.placedAt, locale)}</Text>
        </PressableSurface>
      ))}

      {/* Kuyruk: yükleniyor · düştü · devamı var — üçü ayrı şey (liste ekranlarının aynı ayrımı). */}
      {orders.loadingMore ? (
        <LoadingState size="sm" label={t.list.loading} accessibilityLabel={t.list.loading} testID="new-ticket-orders-tail" />
      ) : orders.tailFailed ? (
        <TextAction label={t.list.tailRetry} onPress={orders.loadMore} tone="terracotta" testID="new-ticket-orders-tail-retry" />
      ) : orders.hasMore ? (
        <TextAction label={t.new.order.more} onPress={orders.loadMore} testID="new-ticket-orders-more" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: { gap: theme.space['2xl'] },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  orderReference: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  orderDate: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
