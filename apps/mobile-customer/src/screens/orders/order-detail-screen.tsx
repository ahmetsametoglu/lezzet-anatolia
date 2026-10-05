import { isCourierOnTheWay } from '@lezzet/domain-core';
import { discountRowLabel, formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import type { OrderDetail } from '@/lib/api/orders';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { toastError, toastSuccess, toastWarning } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { reorderInto } from '@/screens/customer-kit/cart-store';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { DeliveryMap } from './delivery-map';
import { OrderDetailSkeleton } from './order-detail-skeleton';
import { formatDeliveryDate, formatStamp } from './order-format';
import { OrderTimeline } from './order-timeline';
import messages from '@lezzet/i18n/customer/orders';
import { useOrder } from './use-order.hook';

/*
  Sipariş detayı numarayla adreslenir, çünkü müşterinin gördüğü ve destekle konuşurken kullandığı odur; bulunamayan, başkasına ait ve
  taslak aynı "bulunamadı" bloğunu alır. Tasarımdan iki bilinçli sapma: haritada tahmini süre yok (ölçülmeyen süre söz olur), tutar
  özetinde ara toplam ve kargo satırları var (onlarsız toplam açıklanamaz).
*/

type Messages = LocalizedCopy<typeof messages>;

/** Kalem satırının küçük resmi; tasarımın 44 dp'sine en yakın kit durağı `md` (46). */
const LINE_THUMB_SIZE = 'md';

/** `{key}` yer tutucularını doldurur. */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
}

/**
 * Ödeme hâli — web sipariş detayının beş hapı, AYNI SIRAYLA. Sıra anlamlı: iade her şeyi ezer
 * (para geri döndüyse "kapıda ödenecek" demek yanlış olur), vade yöntemden önce gelir (vadeli
 * sipariş de kapıda kapanabilir).
 */
function paymentKey(order: OrderDetail): keyof Messages['detail']['pay'] {
  if (order.paymentStatus === 'refunded') return 'refunded';
  if (order.onAccount) return 'credit';
  if (order.paymentMethod === 'online') return order.paymentStatus === 'paid' ? 'online' : 'transfer';
  if (order.paymentMethod === 'bank_transfer') return 'transfer';
  // Kapıda/depoda tahsil edilmişse borç cümlesi kalmaz; gel-al'da tahsilat kapıda değil depoda.
  if (order.paymentStatus === 'paid') return 'paidOnHandover';
  return order.deliveryType === 'pickup' ? 'pickup' : 'door';
}

/**
 * Taşıyıcı adı: sağlayıcıdan gelen ad özel isimdir ve çevrilmez, elle girilen anahtar çevrilir; ad boş gelen gönderide sözleşmenin
 * eski alanına düşülür.
 */
function carrierLabel(t: Messages, shipment: NonNullable<OrderDetail['shipment']>): string {
  const known = t.detail.carrier as Record<string, string | undefined>;
  if (shipment.carrierName) return known[shipment.carrierName] ?? shipment.carrierName;
  return t.detail.carrier[shipment.carrier];
}

interface OrderDetailScreenProps {
  reference: string;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function OrderDetailScreen({ reference, locale: forcedLocale }: OrderDetailScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const { status, detail, retry } = useOrder(reference, locale);
  const [reordering, setReordering] = useState(false);

  /* Başlık her hâlde durur (şablonda da yüklenen sayfanın üstünde): geri yolu ekran boşken de açık. */
  const appBar = (right?: React.ReactNode) => (
    <AppBar
      title={reference}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="order-back" />}
      right={right}
      testID="order-appbar"
    />
  );

  /* İlk yükte başlık gerçek kalır, sayfanın geri kalanının yerini iskelet tutar. */
  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {appBar()}
        <OrderDetailSkeleton testID="order-loading" />
      </View>
    );
  }

  if (status !== 'ready' || detail === null) {
    /* Üç ayrı hâl, üç ayrı cümle: misafir bir kapıdır (giriş), 404 eski bir bağlantıdır (listeye
       dön), hata bir arızadır (tekrar dene). Tek "hata"ya indirmek üçünü de yanlış anlatırdı. */
    const guest = status === 'guest';
    const missing = status === 'missing';
    return (
      <View style={styles.screen}>
        {appBar()}
        <EmptyState
          icon={
            missing ? (
              <Icon name="orders" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />
            ) : (
              <Icon
                name={guest ? 'orders' : 'connection-off'}
                size={guest ? theme.size.emptyIcon : theme.size.errorIcon}
                color={theme.colors['sand-600']}
              />
            )
          }
          title={guest ? t.guest.title : missing ? t.detail.notFound : t.error.title}
          description={guest ? t.guest.body : missing ? t.detail.notFoundBody : t.error.body}
          action={
            <PrimaryButton
              label={guest ? t.guest.cta : missing ? t.detail.notFoundCta : t.error.retry}
              shape="pill"
              onPress={guest ? () => router.push('/login') : missing ? () => router.push('/orders') : retry}
              testID="order-error-action"
            />
          }
          testID={guest ? 'order-guest' : missing ? 'order-not-found' : 'order-error'}
        />
      </View>
    );
  }

  const address = detail.address;
  /* Gel-al'da adres satırı DEPONUN adresidir (müşteri oraya gider) ve yanına randevu numarası yazılır; fatura adresi çizilmez. */
  const addressLine = detail.pickup
    ? `${detail.pickup.warehouseName}, ${detail.pickup.addressLine} · ${t.detail.pickupPhone.replace('{phone}', detail.pickup.phoneDisplay)}`
    : address === null
      ? null
      : [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')]
          .filter((part) => Boolean(part) && part !== '')
          .join(', ');

  /* Para satırları toplamı açıkladığı için önce gelir, lojistik ve kargo künyesi ardından; sıfır indirim indirim olmadığı için
     çizilmez. */
  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: t.detail.subtotal, value: formatPrice(detail.subtotalCents, locale) },
    ...(detail.discountCents > 0
      ? [
          {
            key: 'discount',
            label: discountRowLabel(t.detail.discount, detail.discountLabel || null),
            value: `−${formatPrice(detail.discountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]
      : []),
    {
      key: 'shipping',
      label: t.detail.shipping,
      value: detail.shippingFeeCents > 0 ? formatPrice(detail.shippingFeeCents, locale) : t.detail.shippingFree,
    },
    {
      key: 'delivery',
      label: t.detail.delivery,
      // Gün yoksa tür yalnız başına yazılır, çünkü kargoda teslim günü taşıyıcının işidir ve söz verilmez.
      value: [
        detail.deliveryType === 'route' ? t.detail.deliveryRoute : detail.deliveryType === 'shipping' ? t.detail.deliveryShipping : t.detail.deliveryPickup,
        detail.deliveryDate === null ? null : formatDeliveryDate(detail.deliveryDate, locale),
      ]
        .filter(Boolean)
        .join(' — '),
    },
    ...(addressLine ? [{ key: 'address', label: t.detail.address, value: addressLine }] : []),
    { key: 'payment', label: t.detail.payment, value: t.detail.pay[paymentKey(detail)] },
    ...(detail.shipment
      ? [
          { key: 'carrier', label: t.detail.carrierLabel, value: carrierLabel(t, detail.shipment) },
          /* Çok kolili gönderide her kutunun ayrı numarası var; sıra (`2/3`) yalnız birden çok kutuda yazılır, `1/1` olmayan bir
             bölünmeyi gösterirdi. */
          ...detail.shipment.parcels.map((parcel) => ({
            key: `tracking-${parcel.trackingNumber}`,
            label:
              parcel.ordinal === null
                ? t.detail.trackingNumber
                : `${t.detail.trackingNumber} ${parcel.ordinal}`,
            value: parcel.trackingNumber,
          })),
        ]
      : []),
  ];

  /* Adresi olan her koli için bir eylem satırı; adresi olmayan koli satır açmaz, çünkü hiçbir yere gitmeyen düğme verilmiş bir söz
     olmaz. */
  // Kalemler bugünkü fiyatla sepete eklenir ve sepet açılır; hiçbiri eklenemezse sayfada kalınır, boş sepete götürmek başarı gösterirdi.
  const reorder = () => {
    if (reordering) return;
    setReordering(true);
    void reorderInto(detail.reference).then((result) => {
      setReordering(false);
      if (result.error !== null) {
        toastError(t.reorder.failed);
        return;
      }
      if (result.data.added === 0) {
        toastWarning(t.reorder.none);
        return;
      }
      if (result.data.skipped.length > 0) {
        toastWarning(fill(t.reorder.skipped, { count: String(result.data.skipped.length), names: result.data.skipped.join(', ') }));
      } else {
        toastSuccess(t.reorder.addedToast);
      }
      router.push('/cart');
    });
  };

  const trackable = (detail.shipment?.parcels ?? []).filter(
    (parcel): parcel is typeof parcel & { trackingUrl: string } => parcel.trackingUrl !== null,
  );
  // Kargodaki siparişi taşıyıcı taşır; "kurye bölgenizde" notu yalnız kurye seferinde doğrudur.
  const timelineNotes = detail.deliveryType === 'shipping' ? { ...t.detail.note, on_the_way: t.detail.onTheWayShipping } : t.detail.note;

  return (
    <View style={styles.screen} testID="order-detail">
      {appBar(<OrderStatusTag status={detail.status} label={t.status[detail.status]} testID="order-status" />)}
      <ScrollView contentContainerStyle={styles.content} testID="order-scroll">
        {/* Harita yalnız kurye seferi yoldayken: durmuş siparişin üstündeki takip görüntüsü olmayan bir hareketi gösterirdi. */}
        {isCourierOnTheWay(detail.status, detail.deliveryType) ? (
          <DeliveryMap trackingLabel={t.detail.tracking} testID="order-map" />
        ) : null}

        {/* Çizgi mi tek blok mu — kararı MOTOR veriyor (`timeline === null` ⇒ iptal/iade). */}
        {detail.timeline === null ? (
          <Note
            description={detail.status === 'cancelled' ? t.detail.cancelled : t.detail.returning}
            tone={detail.status === 'cancelled' ? 'error' : 'terracotta'}
            testID="order-closed-state"
          />
        ) : (
          <OrderTimeline
            steps={detail.timeline}
            labels={t.detail.milestone}
            notes={timelineNotes}
            formatAt={(iso) => formatStamp(iso, locale)}
            testID="order-timeline"
          />
        )}

        <View style={styles.items}>
          <Text style={styles.eyebrow}>{upperIn(t.detail.itemsEyebrow, locale)}</Text>
          {detail.lines.map((line) => (
            <View key={line.id} style={styles.itemBlock} testID={`order-line-${line.id}`}>
              <View style={styles.itemRow}>
                <AvatarThumb
                  initial={line.name.slice(0, 1)}
                  accessibilityLabel={line.name}
                  image={line.image}
                  size={LINE_THUMB_SIZE}
                />
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>
                    {fill(t.detail.line, { quantity: String(line.qty), name: line.name })}
                  </Text>
                  {/* İkinci satır: paket satırında içerik künyesi, varyant satırında boy etiketi.
                      Paket hapı ayrı bir rozet olarak değil bu satırın başında yazılıyor — dar
                      ekranda ad + rozet + tutar üçlüsü tek satıra sığmıyor. */}
                  {line.bundle === null ? (
                    line.unitLabel.length === 0 && !line.shortfall ? null : (
                      <Text style={styles.itemDetail}>
                        {line.unitLabel}
                        {/* Eksik, gramajın yanında satırın ikinci sesi olarak yazılır; kaç sipariş edildiği ad satırında, para
                            çözümü tutar sütununda durur. */}
                        {line.shortfall ? (
                          <Text style={styles.itemShortfall}>
                            {`${line.unitLabel.length === 0 ? '' : ' · '}${fill(t.detail.shortfallLine, {
                              missing: String(line.qty - line.billedQty),
                            })}`}
                          </Text>
                        ) : null}
                      </Text>
                    )
                  ) : (
                    <Text style={styles.itemDetail}>
                      {[
                        fill(t.detail.bundlePill, { count: String(line.bundle.itemCount) }),
                        ...line.bundle.contents,
                      ].join(' · ')}
                    </Text>
                  )}
                </View>
                {/* Eksik varsa tutar sütunu iki sayıdır: üstte sipariş edilenin tutarı çizili, altında ödenecek olan. Çizili değer
                    `shortfallCents` eklenerek türetilir, ikinci bir alan aynı gerçeğin ikinci kaynağı olurdu. */}
                {line.shortfall ? (
                  <View style={styles.itemPriceBox}>
                    <Text style={styles.itemPriceWas} testID={`order-line-was-${line.id}`}>
                      {formatPrice(line.lineTotalCents + line.shortfallCents, locale)}
                    </Text>
                    <Text style={styles.itemPrice}>{formatPrice(line.lineTotalCents, locale)}</Text>
                  </View>
                ) : (
                  <Text style={styles.itemPrice}>{formatPrice(line.lineTotalCents, locale)}</Text>
                )}
              </View>

            </View>
          ))}
        </View>

        <SummaryPanel
          rows={summaryRows}
          totalLabel={t.detail.total}
          totalValue={formatPrice(detail.totalCents, locale)}
          totalTone="terracotta"
          testID="order-summary"
        />

        <PrimaryButton
          label={reordering ? t.reorder.working : t.reorder.placeAgain}
          onPress={reorder}
          disabled={reordering}
          testID="order-reorder"
        />

        {/* Yorum daveti bildiriminin indiği yer: blok yalnız açık davet varken çizilir ve puan sunucudan gelir, ekran rakam uydurmaz. */}
        {((invite) =>
          invite === null ? null : (
          <DashedInvite
            tone="olive"
            layout="stack"
            title={t.detail.feedback.title}
            description={t.detail.feedback.body.replace('{points}', String(invite.points))}
            action={
              <PrimaryButton
                label={t.detail.feedback.cta}
                shape="pill"
                onPress={() => router.push({ pathname: '/feedback/[token]', params: { token: invite.token } })}
                testID="order-feedback-cta"
              />
            }
            testID="order-feedback-invite"
          />
          ))(detail.feedback)}

        {/* Künyesi yukarıda (`trackable`): tek kutuda tek düğme, çok kutuda kutu başına satır. */}
        {trackable.map((parcel) => (
          <View style={styles.actionRow} key={parcel.trackingNumber}>
            <TextAction
              label={
                parcel.ordinal === null
                  ? t.detail.trackingCta
                  : fill(t.detail.trackingCtaBox, { ordinal: parcel.ordinal })
              }
              onPress={() => void Linking.openURL(parcel.trackingUrl)}
              tone="olive"
              testID={parcel.ordinal === null ? 'order-tracking' : `order-tracking-${parcel.ordinal.replace('/', '-')}`}
            />
          </View>
        ))}

        <View style={styles.actionRow}>
          <TextAction
            label={t.detail.support}
            onPress={() => router.push({ pathname: '/support', params: { order: detail.reference } })}
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
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  itemBlock: {
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  itemText: { flex: 1, gap: theme.space['2xs'] },
  itemName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  itemDetail: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  /* Gramajın devamı — AYNI satırın ikinci sesi, kendi kutusu yok. Renk `honey` ("bekleyen durum")
     ve ağırlık bir kademe kalın: cümle gramajdan ayrışmalı ama satırdan kopmamalı. */
  itemShortfall: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    color: theme.colors.honey,
  },
  /* Eksik varsa tutar sütunu iki satır: üstte çizili eski, altında ödenecek. Sağa yaslı çünkü
     sütunun kendisi sağa yaslı — iki sayının basamakları alt alta gelmezse göz karşılaştıramaz. */
  itemPriceBox: { alignItems: 'flex-end', gap: theme.space['2xs'] },
  itemPriceWas: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  itemPrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  actionRow: { alignItems: 'center' },
}));
