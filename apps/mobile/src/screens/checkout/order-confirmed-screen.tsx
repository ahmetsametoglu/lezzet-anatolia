import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { SummaryPanel } from '@/screens/customer-kit/summary-panel';
import messages from './messages.json';

/*
  SİPARİŞ ONAYI (v3 `vConfirm`) — büyük onay işareti, sipariş numarası, teslimat/ödeme/toplam
  özeti, kazanılan puan ve iki çıkış yolu.

  ── UI-ONLY (21.14 ilk etap) ────────────────────────────────────────────────
  Sipariş oluşturma ucu yok; ekran checkout'un verdiği değerlerle çiziliyor. Değerler rota
  PARAMETRESİYLE taşınıyor (durum deposuyla değil) çünkü bu ekranın hayatı tek bir geçişten
  ibarettir: geri gelinemez (`replace` ile açılır), yenilenmez, paylaşılmaz.

  ── SAPMA: onay işaretinin "pop" animasyonu çizilmedi ───────────────────────
  Şablonda işaret 0,5 sn'lik bir yay ile büyüyerek geliyor. RN'de karşılığı `Animated`; tek bir
  giriş efekti için ekranın ömrüne bir animasyon döngüsü bağlamak bu etabın kazancından büyük.
  İşaret ilk kareden itibaren tam boyuyla duruyor — söylediği şey aynı.
*/

type Messages = LocalizedCopy<typeof messages>;

interface OrderConfirmedScreenProps {
  reference: string;
  /** Genel toplam (cent) — rota parametresinden geldiği için çağıran sayıya çevirir. */
  totalCents: number;
  /** Teslimat satırı: seçilen gün ya da kargo yazısı. */
  deliveryLabel: string;
  paymentLabel: string;
  /** Kazanılan puan; 0 ise rozet çizilmez (B2B ve misafirde puan yok). */
  points: number;
}

export function OrderConfirmedScreen({
  reference,
  totalCents,
  deliveryLabel,
  paymentLabel,
  points,
}: OrderConfirmedScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="confirmed-scroll">
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>✓</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t.confirmed.title}
        </Text>
        <Text style={styles.reference}>{t.confirmed.reference.replace('{reference}', reference)}</Text>

        <SummaryPanel
          rows={[
            { key: 'delivery', label: t.confirmed.delivery, value: deliveryLabel },
            { key: 'payment', label: t.confirmed.payment, value: paymentLabel },
          ]}
          totalLabel={t.confirmed.total}
          totalValue={formatPrice(totalCents, locale)}
          testID="confirmed-summary"
        />

        {points > 0 ? (
          <Text style={styles.points} testID="confirmed-points">
            {t.confirmed.points.replace('{n}', String(points))}
          </Text>
        ) : null}
        <Text style={styles.note}>{t.confirmed.note}</Text>

        <View style={styles.actions}>
          <PrimaryButton label={t.confirmed.orders} onPress={() => router.replace('/orders')} testID="confirmed-orders" />
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
  mark: {
    width: customerMetrics.confirmMark,
    height: customerMetrics.confirmMark,
    borderRadius: customerMetrics.confirmMark / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.olive,
  },
  markGlyph: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.card,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  reference: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
  points: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.control,
    color: theme.colors.terracotta,
    backgroundColor: theme.colors['terracotta-bg'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space.lg,
    paddingHorizontal: theme.space['4xl'],
    overflow: 'hidden',
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space.lg,
    marginTop: theme.space.md,
  },
}));
