import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextAction } from '@/components/ui/text-action';
import type { OrderSummary } from '@/lib/api/orders';
import { deviceLocale } from '@/lib/i18n/locale';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { formatOrderDate } from './order-format';
import messages from './messages.json';
import { useOrders } from './use-orders.hook';

/*
  SİPARİŞLERİM (v3 `vOrders`) — GERÇEK UÇTAN okur (`GET /api/v1/me/orders`): misafir kapısı,
  iskelet, ağ hatası, boş durum ve sipariş kartları; hepsi şablonun `ov.` dallarının karşılığı.

  ── ŞABLONUN BEŞ DALI, BEŞİ DE CANLI ────────────────────────────────────────
  `ov.guest` · `ov.skel` · `ov.netErr` · `ov.emptyL` · `ov.rows`. Önceki etapta iskelet ve ağ
  hatası ÇİZİLMEMİŞTİ ve gerekçesi doğruydu ("bu ekranda ağ yok, bugün çizilseler ölü kod
  olurlardı"); ağ geldi, ikisi de açıldı.

  ── SONSUZ KAYDIRMA ─────────────────────────────────────────────────────────
  Liste veriyle SINIRSIZ büyüyen bir küme → keyset + sonsuz kaydırma; imleç URL'e yazılmaz
  (CLAUDE §1). Şablonda sayfalama düğmesi de yok. Kuyruk hatası listeyi düşürmez: satırlar yerinde
  kalır, sona tekrar-dene çıkar (katalogun aynı ayrımı — "hiç veri yok" ≠ "devamı gelmedi").

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **"↻ Tekrar sipariş" düğmesi ÇİZİLMEDİ** (v3:59). Tekrar sipariş, kalemleri BUGÜNKÜ fiyat ve
     BUGÜNKÜ satılabilirlikle sepete kopyalayan bir orkestrasyondur (web `lib/order/reorder.ts`:
     sepet niyet taşır, fiyatı her okumada yeniden çözer) ve o kural henüz `@lezzet/application`a
     terfi etmedi, uç da yok. Mobil sepet ise fiyat TAŞIYOR — sipariş detayındaki donmuş fiyatla
     doldurmak müşteriye sessizce eski fiyatı satmak (ya da tükenmiş malı sepete koymak) olurdu.
     Düğmeyi çizip bir şey yapmaması ise verilmiş bir sözü tutmamaktır. Uç geldiği gün düğme
     şablondaki yerine, `publishToast` onayıyla birlikte döner (paket ekranının aynı deseni).
  2. **Ağ hatası bloğu kesikli çerçeveli kutu DEĞİL** (v3:20-24), katalog/paket ekranlarının
     `EmptyState` + `connection-off` kalıbı: aynı arıza üç ekranda üç ayrı görünüme sahip olmasın.
  3. **Kart bütünüyle basılabilir.** Şablon `o.open`ı üç ayrı bloğa (üst satır, küçük resimler,
     tutar) tek tek bağlıyor; sonuç aynı ama tek dokunma hedefi ekran okuyucuya da tek satır
     olarak gider ("LA-26-… siparişinin detayı").
*/

type Messages = LocalizedCopy<typeof messages>;

/** İskelet kart sayısı ve yüksekliği — şablonun kendi ölçüsü (v3:27-31: üç kart, 110 dp). */
const SKELETON_COUNT = 3;
const SKELETON_HEIGHT = 110;

interface OrdersScreenProps {
  /** Testlerin ve demo hâllerinin kapısı; verilmezse cihazın dili. */
  locale?: ReturnType<typeof deviceLocale>;
}

export function OrdersScreen({ locale = deviceLocale() }: OrdersScreenProps) {
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const orders = useOrders(locale);

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{t.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
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
        {header}
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

  if (orders.status === 'loading') {
    return (
      <View style={styles.screen} testID="orders-loading">
        {header}
        <View style={styles.skeletonBody}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <Skeleton key={index} width="100%" height={SKELETON_HEIGHT} radius="card" />
          ))}
        </View>
      </View>
    );
  }

  if (orders.status === 'error') {
    return (
      <View style={styles.screen}>
        {header}
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
        {header}
        <EmptyState
          icon={<Icon name="orders" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.empty.title}
          description={t.empty.body}
          action={<PrimaryButton label={t.empty.cta} onPress={() => router.push('/catalog')} testID="orders-browse" />}
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
    const open = () => router.push({ pathname: '/order/[reference]', params: { reference: order.reference } });

    return (
      <PressableSurface
        onPress={open}
        feedback="opacity"
        style={styles.card}
        accessibilityLabel={t.row.open.replace('{reference}', order.reference)}
        testID={`order-${order.reference}`}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopText}>
            <Text style={styles.reference}>{order.reference}</Text>
            <Text style={styles.meta}>
              {t.row.meta
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
                photoUri={thumb.image.url}
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
          <TextAction label={t.row.detail} onPress={open} tone="terracotta" />
        </View>
      </PressableSurface>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={orders.orders}
        keyExtractor={(order) => order.reference}
        renderItem={({ item }) => renderOrder(item)}
        ListHeaderComponent={header}
        ListFooterComponent={listFooter()}
        contentContainerStyle={styles.content}
        onEndReached={orders.loadMore}
        // `FlatList` eşiği cömertçe tetikler; ikinci kapı hook'ta (imleç yoksa istek atılmaz).
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={orders.refreshing} onRefresh={orders.refresh} tintColor={theme.colors.olive} />
        }
        testID="orders-list"
      />
    </View>
  );
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
    // v3:9 `gap:3px` — iki durak arasında; eşitlikte ferah yön (2 yerine 4).
    gap: theme.space.xs,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
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
  /* Kart (v3:42): kum zemin, köşe 18, dolgu 14/16, aralık 9 → ferah yön (10). */
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
    borderTopColor: theme.colors['sand-400'],
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
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
