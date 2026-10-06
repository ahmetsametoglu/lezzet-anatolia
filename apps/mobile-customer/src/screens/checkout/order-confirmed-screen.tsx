import { useState } from 'react';
import { confirmationPhaseOf, confirmationToneOf } from '@lezzet/domain-core';
import { formatPrice, formatTime } from '@lezzet/helper';
import { confirmationCopy, type Locale, type LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { hapticError, hapticSuccess } from '@lezzet/mobile-kit/src/lib/haptics/haptics';
import { SummaryPanel } from '@/screens/customer-kit/summary-panel';
import { refreshCart } from '@/screens/customer-kit/cart-store';
import { cancelPendingCheckoutOrder, resumeCheckoutPayment } from '@/lib/api/checkout';
import { presentPayment } from '@/lib/payment/payment-sheet';
import messages from '@lezzet/i18n/customer/checkout';
import { deliveryLabelOf, paymentFailureMessage } from './order-result-copy';
import { useOrderNeighborInvite } from './use-neighbor-invite.hook';
import { useOrderStatus } from './use-order-status.hook';

/*
  Sipariş onayı: işaret, numara, teslimat/ödeme/toplam özeti ve çıkışlar. Kart yolunda sipariş taslaktır ve numarası yoktur: ekran
  sonucu sunucudan bekler, ödemesi gerçekleşmeyen siparişte aynı ödemeye dönüşü ve iptali sunar (web onay sayfasının hâlleri).
*/

type Messages = LocalizedCopy<typeof messages>;

interface OrderConfirmedScreenProps {
  /** Açılan siparişin kimliği — ekranda görünmez, komşu davetini açmaya yarar; `null` ise davet bandı çizilmez. */
  orderId: string | null;
  /** Müşteriye gösterilen sipariş numarası; `null` = sipariş henüz kesinleşmedi, ekran durumu sunucudan bekler. */
  reference: string | null;
  /** Genel toplam (cent); `null` = parametre okunamadı — sıfır YAZILMAZ (CLAUDE §1). */
  totalCents: number | null;
  /** Teslimat satırı: seçilen gün ya da kargo yazısı; boşsa (listeden açıldı) sunucunun özetinden kurulur. */
  deliveryLabel: string;
  /** Ödeme satırı; boşsa kart siparişi olarak yazılır, çünkü listeden yalnız ödeme bekleyen kart siparişi bu ekranı açar. */
  paymentLabel: string;
}

export function OrderConfirmedScreen({
  orderId,
  reference,
  totalCents,
  deliveryLabel,
  paymentLabel,
}: OrderConfirmedScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  const { theme } = useUnistyles();
  const { status, refresh } = useOrderStatus(reference === null ? orderId : null, locale);
  // Durum gelmeden kart taslağı "onaylanıyor"dur; numarası rota parametresiyle gelen sipariş zaten kesinleşmiştir.
  const phase =
    status !== null ? confirmationPhaseOf(status) : reference === null ? 'pending' : 'placed';
  const tone = confirmationToneOf(phase);
  const copy = phase === 'placed' ? null : confirmationCopy(locale, phase);
  const shownReference = reference ?? status?.referenceNo ?? null;
  const neighborInvite = useOrderNeighborInvite(phase === 'placed' ? orderId : null, locale);
  const total = totalCents ?? status?.totalCents ?? null;
  const delivery =
    deliveryLabel !== ''
      ? deliveryLabel
      : status !== null
        ? deliveryLabelOf(status.deliveryType, status.deliveryDate, t, locale)
        : t.confirmed.unknown;
  const payment = paymentLabel !== '' ? paymentLabel : t.payment.online;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="confirmed-scroll">
        <View style={styles.mark(tone)} testID={`confirmed-mark-${tone}`}>
          <Icon
            name={tone === 'failed' ? 'close' : tone === 'ok' ? 'check' : 'timer'}
            size={customerMetrics.confirmIcon}
            color={theme.colors.card}
            bold
          />
        </View>
        <Text style={styles.title} accessibilityRole="header" testID="confirmed-title">
          {copy?.title ?? t.confirmed.title}
        </Text>
        {copy === null ? null : (
          <Text style={styles.status} testID="confirmed-status">
            {copy.body}
          </Text>
        )}
        {shownReference === null ? null : (
          <Text style={styles.reference} testID="confirmed-reference">
            {t.confirmed.reference.replace('{reference}', shownReference)}
          </Text>
        )}

        <View style={styles.summary}>
          <SummaryPanel
            rows={[
              { key: 'delivery', label: t.confirmed.delivery, value: delivery },
              { key: 'payment', label: t.confirmed.payment, value: payment },
            ]}
            totalLabel={t.confirmed.total}
            totalValue={total === null ? t.confirmed.unknown : formatPrice(total, locale)}
            testID="confirmed-summary"
          />
        </View>

        {phase === 'placed' ? <Text style={styles.note}>{t.confirmed.note}</Text> : null}

        {/* Komşu daveti onay anında, çünkü sefer ve gün o an somut; paylaşım sistem sayfasından. Bağlantı yoksa bant çizilmez. */}
        {neighborInvite === null || neighborInvite.inviteUrl === null ? null : (
          <View style={styles.neighbor} testID="confirmed-neighbor">
            <View style={styles.neighborHeading}>
              <Icon name="truck" size={theme.size.inlineIcon} color={theme.colors.olive} />
              <Text style={styles.neighborTitle}>{t.confirmed.neighborTitle}</Text>
            </View>
            <Text style={styles.neighborBody}>{t.confirmed.neighborBody}</Text>
            {/* Kontenjan yazılır, dolmuş davet paylaşılmasın; sayı sözleşmeden gelir, sabit yazılsaydı ayar değişince yalan söylerdi. */}
            <Text style={styles.neighborLimit} testID="confirmed-neighbor-limit">
              {(neighborInvite.remainingUses === 0 ? t.confirmed.neighborFull : t.confirmed.neighborRemaining)
                .replace('{n}', String(neighborInvite.remainingUses))
                .replace('{max}', String(neighborInvite.maxUses))}
            </Text>
            {/* Dolduysa paylaşım sunulmaz; bant kalır, ne olduğunu söyleyen cümleyle. */}
            {neighborInvite.remainingUses > 0 ? (
              <SecondaryButton
                label={t.confirmed.neighborShare}
                onPress={() =>
                  void Share.share({ message: t.confirmed.neighborMessage.replace('{url}', neighborInvite.inviteUrl ?? '') })
                }
                tone="olive"
                shape="pill"
                testID="confirmed-neighbor-share"
              />
            ) : null}
          </View>
        )}

        {phase === 'unpaid' && orderId !== null ? (
          <PendingPaymentActions
            t={t}
            locale={locale}
            orderId={orderId}
            totalCents={total}
            payBy={status?.payBy ?? null}
            onSettled={refresh}
          />
        ) : (
          <View style={styles.actions}>
            {/* Olmadıysa çıkış sepete: iptal edilen siparişin kalemleri oraya döndü. */}
            {tone === 'failed' ? (
              <PrimaryButton
                label={t.confirmed.retry}
                onPress={() => {
                  refreshCart();
                  router.replace('/cart');
                }}
                testID="confirmed-retry"
              />
            ) : (
              <PrimaryButton label={t.confirmed.orders} onPress={() => router.replace('/orders')} testID="confirmed-orders" />
            )}
            <SecondaryButton label={t.confirmed.home} onPress={() => router.replace('/')} testID="confirmed-home" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface PendingPaymentActionsProps {
  t: Messages;
  locale: Locale;
  orderId: string;
  totalCents: number | null;
  /** Ödemenin son anı; `null` saat yazılmaz. */
  payBy: string | null;
  /** Ödeme geçtiğinde ya da sipariş başka yoldan netleştiğinde ekran durumu yeniden sorar. */
  onSettled: () => void;
}

/**
 * Ödemesi gerçekleşmeyen siparişin eylemleri: aynı ödemeye dönülür (kart yeniden açılır, bilgiler değiştirilebilir) ya da sipariş
 * iptal edilir ve kalemler sepete döner. Yeni sipariş açılmaz.
 */
function PendingPaymentActions({ t, locale, orderId, totalCents, payBy, onSettled }: PendingPaymentActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    const resumed = await resumeCheckoutPayment(locale, orderId);
    if (resumed.error !== null) {
      setBusy(false);
      hapticError();
      setError(t.reject.transport);
      return;
    }
    if (resumed.data.status !== 'payment_required') {
      setBusy(false);
      onSettled();
      return;
    }
    const sheet = await presentPayment({ paymentToken: resumed.data.paymentToken });
    setBusy(false);
    if (sheet.status === 'succeeded') {
      hapticSuccess();
      onSettled();
    } else if (sheet.status === 'failed') {
      hapticError();
      setError(paymentFailureMessage(sheet, t));
    }
  };

  const cancel = async () => {
    setBusy(true);
    setError(null);
    const result = await cancelPendingCheckoutOrder(locale, orderId);
    setBusy(false);
    if (result.error !== null) {
      hapticError();
      setError(t.confirmed.cancelFailed);
      return;
    }
    // İptal edilemediyse ödeme geçmiş ya da işleniyordur; ekran yeni hâli sunucudan okur.
    if (result.data.status !== 'cancelled') {
      onSettled();
      return;
    }
    refreshCart();
    router.replace('/cart');
  };

  return (
    <View style={styles.actions}>
      {payBy === null ? null : (
        <Text style={styles.note} testID="confirmed-pay-by">
          {t.confirmed.unpaidDeadline.replace('{time}', formatTime(payBy, locale))}
        </Text>
      )}
      {error === null ? null : (
        <Text style={styles.error} testID="confirmed-pending-error">
          {error}
        </Text>
      )}
      <PrimaryButton
        label={totalCents === null ? t.confirmed.payNow : `${t.confirmed.payNow} · ${formatPrice(totalCents, locale)}`}
        onPress={() => void pay()}
        disabled={busy}
        testID="confirmed-pay"
      />
      <SecondaryButton label={t.confirmed.cancelOrder} onPress={() => void cancel()} disabled={busy} testID="confirmed-cancel" />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  /* Üst pay kaydırılan içerikte değil kapta, çünkü içerikte olsaydı uzun özet kaydırılınca saatin arkasından geçerdi. */
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top,
  },
  content: {
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingTop: theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
  },
  mark: (tone: 'failed' | 'ok' | 'waiting') => ({
    width: customerMetrics.confirmMark,
    height: customerMetrics.confirmMark,
    borderRadius: customerMetrics.confirmMark / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tone === 'failed' ? theme.colors['terracotta-bright'] : tone === 'ok' ? theme.colors.olive : theme.colors.honey,
  }),
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  status: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
    textAlign: 'center',
  },
  reference: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
  error: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors['terracotta-bright'],
    textAlign: 'center',
  },
  // Ekran içeriği ortalanıyor; özet ortalanınca içerik genişliğine büzülüp etiketle değeri yan yana sıkıştırırdı.
  summary: { alignSelf: 'stretch' },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space.lg,
    marginTop: theme.space.md,
  },
  /* Bant kitin bilgi kutusu dilinde; yeni bir blok dili icat edilmedi. */
  neighbor: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: theme.space.md,
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['4xl'],
  },
  neighborHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  neighborTitle: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  neighborBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
  /* Sınır cümlesi gövdeden bir tık ÖNDE (600): bir kolaylık değil bir KURAL söylüyor ve kullanıcı
     onu paylaşmadan önce görmeli. Ayrı bir ton verilmedi — uyarı değil, bilgi. */
  neighborLimit: {
    fontFamily: theme.font.body[600],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
