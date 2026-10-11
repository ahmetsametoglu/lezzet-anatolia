import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { Redirect, useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { PageHeaderBar, PageHeaderHero, usePageHeader } from '@/components/ui/page-header';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { OrderSummary } from '@/lib/api/orders';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { formatOrderDate } from './order-format';
import messages from '@lezzet/i18n/customer/orders';
import { OrdersSkeleton } from './orders-skeleton';
import { useOrders } from './use-orders.hook';

/*
  Siparişlerim: liste keyset + sonsuz kaydırmayla büyür ve kuyruk hatası satırları düşürmez. Misafir doğrudan girişe gider, PWA'daki
  sayfanın davranışı.
*/

type Messages = LocalizedCopy<typeof messages>;

interface OrdersScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function OrdersScreen({ locale: forcedLocale }: OrdersScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const orders = useOrders(locale);

  const page = usePageHeader();

  // Ekran hep yığında açılır ve yığında sekme çubuğu yok; dönüşün görünür yolu geri satırı.
  const bar = (
    <PageHeaderBar title={t.title} collapsed={page.collapsed} backLabel={t.back} onBack={() => router.back()} testID="orders-back" />
  );
  const hero = <PageHeaderHero eyebrow={upperIn(t.eyebrow, locale)} title={t.title} onTitleLayout={page.onTitleLayout} style={styles.hero} />;

  if (orders.status === 'guest') return <Redirect href="/login" />;

  /* İskelet, hata ve boş hâl listenin yerine geçer, çünkü hiçbirinde kaydırılacak satır yok. */
  if (orders.status === 'loading') {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.headerPad}>{hero}</View>
        <View style={styles.skeletonBody}>
          <OrdersSkeleton testID="orders-loading" />
        </View>
      </View>
    );
  }

  if (orders.status === 'error') {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.headerPad}>{hero}</View>
        <EmptyState
          icon={<Icon name="connection-off" size={theme.size.errorIcon} color={theme.colors['sand-600']} />}
          title={t.error.title}
          description={t.error.body}
          action={<PrimaryButton label={t.error.retry} shape="pill" onPress={orders.retry} testID="orders-retry" />}
          testID="orders-error"
        />
      </View>
    );
  }

  if (orders.orders.length === 0) {
    return (
      <View style={styles.screen}>
        {bar}
        <View style={styles.headerPad}>{hero}</View>
        <EmptyState
          icon={<Icon name="orders" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.empty.title}
          description={t.empty.body}
          /* Hap biçim, çünkü tasarımda boş hâl çağrısı haptır; blok biçim form ve seçim eylemlerinindir. */
          action={<PrimaryButton label={t.empty.cta} shape="pill" onPress={() => router.push('/catalog')} testID="orders-browse" />}
          testID="orders-empty"
        />
      </View>
    );
  }

  /** Listenin kuyruğu: yükleniyor · düştü · bitti — üçü ayrı şey, üçü ayrı gösterilir. */
  const listFooter = () => {
    if (orders.loadingMore) {
      return (
        <View style={styles.tail}>
          <LoadingState size="sm" label={t.list.loading} accessibilityLabel={t.list.loading} testID="orders-tail-loading" />
        </View>
      );
    }
    if (orders.tailFailed) {
      return (
        <View style={styles.tail}>
          <PrimaryButton label={t.list.tailRetry} shape="pill" onPress={orders.loadMore} testID="orders-tail-retry" />
        </View>
      );
    }
    if (!orders.hasMore) return <Text style={styles.tailNote}>{t.list.end}</Text>;
    return null;
  };

  const renderOrder = (order: OrderSummary) => {
    // Ödeme bekleyen siparişin numarası yok; kart ödeme ekranını açar, çünkü tek eylemi ödemesi.
    const open =
      order.reference === null
        ? () => router.push({ pathname: '/checkout/confirmed', params: { orderId: order.orderId, total: String(order.totalCents) } })
        : () => router.push({ pathname: '/order/[reference]', params: { reference: order.reference } });

    return (
      <PressableSurface
        onPress={open}
        feedback="opacity"
        style={styles.card}
        accessibilityLabel={order.reference === null ? t.row.openPending : t.row.open.replace('{reference}', order.reference)}
        testID={`order-${keyOf(order)}`}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopText}>
            <Text style={styles.reference}>{order.reference ?? t.row.pendingTitle}</Text>
            <Text style={styles.meta}>
              {(order.itemCount === 1 ? t.row.metaOne : t.row.meta)
                .replace('{date}', formatOrderDate(order.placedAt, locale))
                .replace('{count}', String(order.itemCount))}
            </Text>
          </View>
          <OrderStatusTag status={order.status} label={t.status[order.status]} />
        </View>

        {/* Küme ve "+N" sunucuda tekilleşir, listenin uzunluğundan türetilmez: aynı ürünün iki boyu tek halkadır. */}
        {order.thumbs.length === 0 ? null : (
          <View style={styles.thumbs}>
            {order.thumbs.map((thumb, index) => (
              <AvatarThumb
                key={`${thumb.name}-${index}`}
                initial={thumb.name.slice(0, 1)}
                accessibilityLabel={thumb.name}
                image={thumb.image}
                size="sm"
                stacked
              />
            ))}
            {order.moreCount > 0 ? (
              <Text style={styles.more}>{t.row.more.replace('{n}', String(order.moreCount))}</Text>
            ) : null}
          </View>
        )}

        <View style={styles.cardBottom}>
          <Text style={styles.total}>{formatPrice(order.totalCents, locale)}</Text>
          {/* Kart zaten basılabilir; bu yazı düğme değil işaret, kendi dokunma hedefi yok ki a11y'de tek satır kalsın. */}
          <TextAction label={order.reference === null ? t.row.pay : t.row.detail} onPress={open} tone="terracotta" />
        </View>
      </PressableSurface>
    );
  };

  return (
    <View style={styles.screen}>
      {bar}
      <FlatList
        data={orders.orders}
        keyExtractor={keyOf}
        renderItem={({ item }) => renderOrder(item)}
        ListHeaderComponent={hero}
        onScroll={page.onScroll}
        scrollEventThrottle={16}
        ListFooterComponent={listFooter()}
        contentContainerStyle={styles.content}
        onEndReached={orders.loadMore}
        // `FlatList` eşiği cömertçe tetikler; ikinci kapı hook'ta (imleç yoksa istek atılmaz).
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={orders.refreshing} onRefresh={orders.refresh} {...pullRefreshColors(theme.colors.olive)} />
        }
        testID="orders-list"
      />
    </View>
  );
}

/** Satırın kimliği: numaralı siparişte numara, ödeme bekleyende sipariş kimliği. */
function keyOf(order: OrderSummary): string {
  return order.reference ?? order.orderId;
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    paddingHorizontal: theme.space['4xl'],
    paddingBottom: theme.space['5xl'],
    gap: theme.space.xl,
  },
  hero: { paddingBottom: theme.space.xs },
  /* Başlık listede kaydırma kabının dolgusunu alır; kabın olmadığı dallarda dolgu sarmalayıcıdan gelir, başlığa konsa listede çift olurdu. */
  headerPad: { paddingHorizontal: theme.space['4xl'] },
  skeletonBody: {
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space.xl,
  },
  /* Tasarımın 9 px aralığı iki basamağın ortasında; ferah olan (10) seçilir. */
  card: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
    gap: theme.space.lg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  cardTopText: { flex: 1, gap: theme.space['2xs'] },
  reference: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
  },
  meta: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
  thumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    // İlk avatarın negatif kenar boşluğunu telafi eder: yığın soldan hizalı başlar.
    paddingLeft: theme.space.lg,
  },
  more: {
    marginLeft: theme.space.md,
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.lg,
    borderTopWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
  },
  total: {
    fontFamily: theme.font.body[theme.text['step-sm--font-weight']],
    fontSize: theme.text['step-sm'],
    color: theme.colors.ink,
  },
  tail: {
    alignItems: 'center',
    paddingTop: theme.space.lg,
  },
  tailNote: {
    paddingTop: theme.space.lg,
    textAlign: 'center',
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
}));
