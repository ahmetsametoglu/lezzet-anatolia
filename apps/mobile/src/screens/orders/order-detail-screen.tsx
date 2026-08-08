import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import { deviceLocale } from '@/lib/i18n/locale';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { SummaryPanel } from '@/screens/customer-kit/summary-panel';
import { DeliveryMap } from './delivery-map';
import { OrderTimeline } from './order-timeline';
import { orderByReference, type OrderView } from './orders-fixture';
import messages from './messages.json';

/*
  SİPARİŞ DETAY (v3 `vOrder`) — canlı takip haritası (yalnız kurye yoldayken), zaman çizgisi,
  kalemler, tutar özeti ve üç eylem (tekrar sipariş · değerlendir · bize yazın).

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  Sipariş ucu yok; veri fixture'dan referansla okunuyor. BULUNAMAYAN referans SESSİZ DEĞİL:
  boş bir ekran ya da uydurma bir sipariş yerine "bu sipariş bulunamadı" bloğu çıkar ve listeye
  götürür (CLAUDE §1 — ölçülemeyen değer sıfır değildir; olmayan kayıt da boş kayıt değildir).

  DEĞERLENDİRME düğmesi YALNIZ teslim edilmişte (şablonun kendi kuralı): teslim edilmemiş bir
  siparişin ürünlerini değerlendirmek istenemez.
*/

type Messages = LocalizedCopy<typeof messages>;

interface OrderDetailScreenProps {
  reference: string;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse fixture'dan referansla okunur. */
  order?: OrderView | null;
}

export function OrderDetailScreen({ reference, order = orderByReference(reference) }: OrderDetailScreenProps) {
  const locale = deviceLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();

  if (order === null) {
    return (
      <View style={styles.screen}>
        <AppBar
          title={reference}
          left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="order-back" />}
        />
        <EmptyState
          icon={<Icon name="orders" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />}
          title={t.detail.notFound}
          description={t.detail.notFoundBody}
          action={<PrimaryButton label={t.detail.notFoundCta} shape="pill" onPress={() => router.push('/orders')} testID="order-not-found-cta" />}
          testID="order-not-found"
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <AppBar
        title={order.reference}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="order-back" />}
        right={<OrderStatusTag status={order.status} label={t.status[order.status]} testID="order-status" />}
        testID="order-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} testID="order-scroll">
        {/* Harita YALNIZ kurye yoldayken: durmuş bir siparişin üstünde hareketli bir takip
            görüntüsü, olmayan bir şeyi oluyormuş gibi gösterirdi. */}
        {order.status === 'on_the_way' && order.etaLabel !== null ? (
          <DeliveryMap
            trackingLabel={t.detail.tracking.replace('{eta}', order.etaLabel)}
            liveLabel={t.detail.trackingLive}
            testID="order-map"
          />
        ) : null}

        <OrderTimeline
          status={order.status}
          times={order.timeline}
          labels={t.detail.timeline}
          notes={t.detail.note}
          testID="order-timeline"
        />

        <View style={styles.items}>
          <Text style={styles.eyebrow}>{t.detail.itemsEyebrow.toLocaleUpperCase('tr-TR')}</Text>
          {order.lines.map((line) => (
            <View key={line.id} style={styles.itemRow} testID={`order-line-${line.id}`}>
              <AvatarThumb
                initial={line.name.slice(0, 1)}
                accessibilityLabel={line.name}
                photoUri={line.photoUri}
                size="md"
              />
              <View style={styles.itemText}>
                <Text style={styles.itemName}>
                  {t.detail.line.replace('{quantity}', String(line.quantity)).replace('{name}', line.name)}
                </Text>
                <Text style={styles.itemDetail}>{line.detail}</Text>
              </View>
              <Text style={styles.itemPrice}>{formatPrice(line.totalCents, locale)}</Text>
            </View>
          ))}
        </View>

        <SummaryPanel
          rows={[
            { key: 'delivery', label: t.detail.delivery, value: order.deliveryLabel },
            { key: 'address', label: t.detail.address, value: order.addressLabel },
            { key: 'payment', label: t.detail.payment, value: order.paymentLabel },
          ]}
          totalLabel={t.detail.total}
          totalValue={formatPrice(order.totalCents, locale)}
          totalTone="terracotta"
          testID="order-summary"
        />

        <PrimaryButton label={t.detail.reorder} onPress={() => router.push('/cart')} testID="order-reorder" />
        {order.status === 'delivered' ? (
          <SecondaryButton
            label={t.detail.feedback}
            onPress={() => router.push('/discover')}
            tone="olive"
            testID="order-feedback"
          />
        ) : null}
        <View style={styles.supportRow}>
          <TextAction
            label={t.detail.support}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'faq' } })}
            tone="terracotta"
            testID="order-support"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  items: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    fontWeight: theme.text['eyebrow--font-weight'],
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  itemText: { flex: 1, gap: theme.space['2xs'] },
  itemName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  itemDetail: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
  },
  itemPrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    fontWeight: theme.text['button--font-weight'],
    color: theme.colors.ink,
  },
  supportRow: { alignItems: 'center' },
}));
