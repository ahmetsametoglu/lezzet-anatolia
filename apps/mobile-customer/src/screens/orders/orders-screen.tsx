import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { pullRefreshColors } from '@lezzet/mobile-kit/src/components/ui/pull-refresh';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
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
  Siparişlerim: misafir kapısı, iskelet, ağ hatası, boş durum ve sipariş kartları; liste keyset + sonsuz kaydırmayla büyür ve kuyruk
  hatası satırları düşürmez. Kart bütünüyle basılabilir; ödeme bekleyen sipariş detay yerine ödeme ekranını açar.
*/

type Messages = LocalizedCopy<typeof messages>;

/* İskeletin kart sayısı `orders-skeleton`ın kendi sabiti; yükseklik kartın yapısından kendiliğinden çıkar. */

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

  /* Geri oku: ekran hep yığında açılır ve yığın ekranında sekme çubuğu yok, dönüşün görünür yolu bu. */
  const header = (
    <View style={styles.header}>
      <View style={styles.backRow}>
        <BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="orders-back" />
      </View>
      <Text style={styles.eyebrow}>{upperIn(t.eyebrow, locale)}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
    </View>
  );

  /* Misafir · iskelet · hata · boş — dördü de listenin YERİNE geçer, içine değil: hiçbirinde
     kaydırılacak bir satır yok ve `FlatList` kabuğu boşuna kurulmaz. */
  if (orders.status === 'guest') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <EmptyState
          icon={<Icon name="orders" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.guest.title}
          description={t.guest.body}
          action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="orders-login" />}
          testID="orders-guest"
        />
      </View>
    );
  }

  /* İLK YÜK: başlık GERÇEK kalır (geri düğmesi çalışır), kartların yerini skeleton tutar. Blok
     ekrandan `orders-skeleton`a taşındı: kartın içi hiç tanınmıyordu ve yüksekliği tek ham sayı
     olarak yazılıydı — kartın dolgusu değiştiğinde sessizce yanlışa düşerdi. */
  if (orders.status === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
        <View style={styles.skeletonBody}>
          <OrdersSkeleton testID="orders-loading" />
        </View>
      </View>
    );
  }

  if (orders.status === 'error') {
    return (
      <View style={styles.screen}>
        <View style={styles.headerPad}>{header}</View>
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
        <View style={styles.headerPad}>{header}</View>
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

        {/* Küçük resim yığını: soldan sağa binerek dizilir (kitin `stacked` varyantı). Küme
            SUNUCUDA tekilleştirilip sınırlandı — "+N" de oradan gelir, listenin uzunluğundan
            türetilmez (aynı ürünün iki boyu tek halkadır ve iki kez sayılmamalı). */}
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
          {/* Kart zaten basılabilir; bu yazı bir DÜĞME değil, nereye gidileceğini söyleyen bir
              işaret — o yüzden kendi dokunma hedefini açmıyor (a11y'de tek satır kalsın). */}
          <TextAction label={order.reference === null ? t.row.pay : t.row.detail} onPress={open} tone="terracotta" />
        </View>
      </PressableSurface>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={orders.orders}
        keyExtractor={keyOf}
        renderItem={({ item }) => renderOrder(item)}
        ListHeaderComponent={header}
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
  header: {
    // Tasarımın 3 px'i iki basamağın ortasında; eşitlikte ferah olan seçilir.
    gap: theme.space.xs,
    /* Üst pay sayfa dolgusu ile başlık bloğunun kendi payının toplamıdır; `insets.top` durum çubuğunu karşılar, bu pay onun üstüne binir. */
    paddingTop: theme.space['3xl'],
    paddingBottom: theme.space.xs,
  },
  /** Geri düğmesinin dairesi sayfanın sol dolgusuna taşar (tasarımda `margin-left:-8px`). */
  backRow: {
    flexDirection: 'row',
    /* Glif başlıkla hizalanır: daire 40 dp ve glif ortalı olduğu için −16 glifin sol kenarını başlığın sol kenarına oturtur. */
    marginLeft: -theme.space['3xl'],
  },
  /* Başlık listede kaydırma kabının dolgusunu alır; kabın olmadığı dallarda dolgu sarmalayıcıdan gelir, başlığa konsa listede çift olurdu. */
  headerPad: { paddingHorizontal: theme.space['4xl'] },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
  },
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
