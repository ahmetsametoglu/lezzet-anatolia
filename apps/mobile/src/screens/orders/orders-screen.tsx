import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import { deviceLocale } from '@/lib/i18n/locale';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { ordersFixture, type OrderView } from './orders-fixture';
import messages from './messages.json';

/*
  SİPARİŞLERİM (v3 `vOrders`) — misafir kapısı, boş durum ve sipariş kartları.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  Sipariş ucu YOK; liste fixture'dan. İskelet ve ağ hatası durumları ÇİZİLMEDİ (şablonda varlar):
  ikisi de bir AĞ olduğunu varsayar ve bu ekranda ağ yok — bugün çizilseler hiçbir koşulda
  görünmeyen ölü kod olurlardı. Uç bağlandığında ikisi de kataloğun kendi kalıbıyla eklenir
  (`CatalogSkeleton` + `EmptyState`/`connection-off`), yani deseni zaten yazılı.

  MİSAFİR KAPISI gerçek: oturum durumu prop'tan geliyor ve varsayılanı "giriş yapılmış" —
  oturum deposuna bağlanma sonraki etabın işi (giriş ekranıyla aynı gerekçe).
*/

type Messages = LocalizedCopy<typeof messages>;

/** Karttaki küçük resim sayısı — şablonun kendi sınırı (dört ürün + bir paket). */
const MAX_THUMBS = 5;

interface OrdersScreenProps {
  orders?: OrderView[];
  /** Oturum durumu — misafirde liste yerine doğrulama kapısı çıkar. */
  signedIn?: boolean;
}

export function OrdersScreen({ orders = ordersFixture(), signedIn = true }: OrdersScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  const header = (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{t.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t.title}
      </Text>
    </View>
  );

  if (!signedIn) {
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

  if (orders.length === 0) {
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

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="orders-list">
        {header}
        {orders.map((order) => {
          const itemCount = order.lines.reduce((total, line) => total + line.quantity, 0);
          const open = () =>
            router.push({ pathname: '/order/[reference]', params: { reference: order.reference } });

          return (
            <View key={order.reference} style={styles.card} testID={`order-${order.reference}`}>
              <PressableSurface
                onPress={open}
                feedback="opacity"
                style={styles.cardTop}
                accessibilityLabel={t.row.open.replace('{reference}', order.reference)}
                testID={`order-${order.reference}-open`}
              >
                <View style={styles.cardTopText}>
                  <Text style={styles.reference}>{order.reference}</Text>
                  <Text style={styles.meta}>
                    {t.row.meta.replace('{date}', order.placedAtLabel).replace('{count}', String(itemCount))}
                  </Text>
                </View>
                <OrderStatusTag status={order.status} label={t.status[order.status]} />
              </PressableSurface>

              {/* Küçük resim yığını: soldan sağa binerek dizilir (kitin `stacked` varyantı). */}
              <View style={styles.thumbs}>
                {order.lines.slice(0, MAX_THUMBS).map((line) => (
                  <AvatarThumb
                    key={line.id}
                    initial={line.name.slice(0, 1)}
                    accessibilityLabel={line.name}
                    photoUri={line.photoUri}
                    size="sm"
                    stacked
                  />
                ))}
                {order.lines.length > MAX_THUMBS ? (
                  <Text style={styles.more}>{t.row.more.replace('{n}', String(order.lines.length - MAX_THUMBS))}</Text>
                ) : null}
              </View>

              <View style={styles.cardBottom}>
                <Text style={styles.total}>{formatPrice(order.totalCents, locale)}</Text>
                <View style={styles.actions}>
                  {/* Tekrar sipariş sepeti kurar ve sepete götürür — sonraki etapta gerçek
                      kalemlerle; bugün sepet zaten fixture'dan dolu, yani akış canlı. */}
                  <SecondaryButton
                    label={t.row.reorder}
                    onPress={() => router.push('/cart')}
                    tone="olive"
                    shape="pill"
                    testID={`order-${order.reference}-reorder`}
                  />
                  <TextAction label={t.row.detail} onPress={open} tone="terracotta" />
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
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
    gap: theme.space['2xs'],
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.xs,
  },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    fontWeight: theme.text['page-title-sm--font-weight'],
    color: theme.colors.ink,
  },
  card: {
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    padding: theme.space['2xl'],
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
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['button--font-weight'],
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
    fontWeight: theme.text['step-sm--font-weight'],
    color: theme.colors.ink,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
}));
