import { confirmationPhaseOf, confirmationToneOf } from '@lezzet/domain-core';
import { formatPrice } from '@lezzet/helper';
import { confirmationCopy, type LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { customerMetrics } from '@lezzet/mobile-kit/src/components/customer/customer-metrics';
import { SummaryPanel } from '@/screens/customer-kit/summary-panel';
import messages from '@lezzet/i18n/customer/checkout';
import { useOrderNeighborInvite } from './use-neighbor-invite.hook';
import { useOrderStatus } from './use-order-status.hook';

/*
  Sipariş onayı: onay işareti, numara, teslimat/ödeme/toplam özeti ve iki çıkış. Puan satırı yok, sipariş puanı kalktı.
  Kart yolunda sipariş o an taslaktır ve numarası yoktur: ekran ödemenin sonucunu sunucudan bekler, web onay sayfasıyla aynı hâlleri çizer.
*/

type Messages = LocalizedCopy<typeof messages>;

interface OrderConfirmedScreenProps {
  /** Açılan siparişin kimliği — ekranda görünmez, komşu davetini açmaya yarar; `null` ise davet bandı çizilmez. */
  orderId: string | null;
  /** Müşteriye gösterilen sipariş numarası; `null` = sipariş henüz kesinleşmedi, ekran durumu sunucudan bekler. */
  reference: string | null;
  /** Genel toplam (cent); `null` = parametre okunamadı — sıfır YAZILMAZ (CLAUDE §1). */
  totalCents: number | null;
  /** Teslimat satırı: seçilen gün ya da kargo yazısı. */
  deliveryLabel: string;
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
  const status = useOrderStatus(reference === null ? orderId : null, locale);
  // Durum gelmeden kart taslağı "onaylanıyor"dur; numarası rota parametresiyle gelen sipariş zaten kesinleşmiştir.
  const phase =
    status !== null ? confirmationPhaseOf(status) : reference === null ? 'pending' : 'placed';
  const tone = confirmationToneOf(phase);
  const copy = phase === 'placed' ? null : confirmationCopy(locale, phase);
  const shownReference = reference ?? status?.referenceNo ?? null;
  const neighborInvite = useOrderNeighborInvite(phase === 'placed' ? orderId : null, locale);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="confirmed-scroll">
        <View style={styles.mark(tone)} testID={`confirmed-mark-${tone}`}>
          <Icon
            name={tone === 'failed' ? 'close' : tone === 'ok' ? 'check' : 'timer'}
            size={theme.text['page-title-sm']}
            color={theme.colors.card}
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

        <SummaryPanel
          rows={[
            { key: 'delivery', label: t.confirmed.delivery, value: deliveryLabel },
            { key: 'payment', label: t.confirmed.payment, value: paymentLabel },
          ]}
          totalLabel={t.confirmed.total}
          totalValue={totalCents === null ? t.confirmed.unknown : formatPrice(totalCents, locale)}
          testID="confirmed-summary"
        />

        {phase === 'placed' ? <Text style={styles.note}>{t.confirmed.note}</Text> : null}

        {/* Komşu daveti onay anında, çünkü sefer ve gün o an somut; paylaşım sistem sayfasından. Bağlantı yoksa bant çizilmez. */}
        {neighborInvite === null || neighborInvite.inviteUrl === null ? null : (
          <View style={styles.neighbor} testID="confirmed-neighbor">
            <Text style={styles.neighborTitle}>{t.confirmed.neighborTitle}</Text>
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

        <View style={styles.actions}>
          {/* Olmadıysa çıkış sepete: yeni deneme eski taslağı ve eski ödemeyi kapatır. */}
          {tone === 'failed' ? (
            <PrimaryButton label={t.confirmed.retry} onPress={() => router.replace('/cart')} testID="confirmed-retry" />
          ) : (
            <PrimaryButton label={t.confirmed.orders} onPress={() => router.replace('/orders')} testID="confirmed-orders" />
          )}
          <SecondaryButton label={t.confirmed.home} onPress={() => router.replace('/')} testID="confirmed-home" />
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
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingTop: rt.insets.top + theme.space['9xl'],
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
