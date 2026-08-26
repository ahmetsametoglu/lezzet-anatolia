import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { ManagementSummary } from '@lezzet/types';
import { managementCopy } from './copy';
import { useManagementHub } from './use-management-hub.hook';

/*
  Y5 · GÜN ÖZETİ (v2:664-696) — yönetimin TEK salt-okunur ekranı: günün fotoğrafı.

  Hiçbir eylem YOK ve bu tasarımın kararı ("salt okuma · günün fotoğrafı"). Ekran bir karar
  vermiyor, kararların ZEMİNİNİ gösteriyor; bir düğme eklemek burada olmayan bir yetki vaat ederdi.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  Hub ile AYNI zarf (`/management/hub`) okunur — "kutu 3 diyor, özet 2" çelişkisi motor düzeyinde
  imkânsız. Kanal kırılımı sipariş sayacının eksenindedir: gün = TESLİM günü (`order_counts`).

  ── ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİLDİR ────────────────────────────────────────
  Kanal cirosu `null` gelirse ekran "— bilinmiyor (sıfır değil)" yazar (v2:673 birebir). YZ
  içgörüsü de aynı disiplinde: motoru (modül 20/22) bağlanana dek uç BOŞ dizi döner ve blok bunu
  dürüstçe söyler — uydurma içgörü, yerel veriden iş çıkarımı olurdu (CLAUDE §0).

  ── "ROTAYA ATANMAMIŞ" CÜMLEDEN ÇIKTI ───────────────────────────────────────
  v2 yarın satırında "atanmamış" sayıyordu; sefer SABAH kurulur (`delivery_run.start`), bugünden
  o sayıyı üretecek bir ölçüm yok. Ölçülemeyeni yazmamak, sıfır ya da uydurma yazmaktan iyidir.
*/

const t = managementCopy;

/** İçgörünün noktası — iyi (zeytin) · izle (terracotta) · kötü (kırmızı); v2:686-688. */
const INSIGHT_COLOR = {
  good: operationsTheme.colors.olive,
  watch: operationsTheme.colors.terracotta,
  bad: operationsTheme.colors.error,
} as const satisfies Record<ManagementSummary['insights'][number]['tone'], string>;

/** Kanal etiketleri sözlükten — sözleşme `manual`ı da taşıyabilir diye anahtar kapalı okunur. */
const CHANNEL_LABEL: Partial<Record<string, string>> = {
  web: t.summary.channels.web,
  door: t.summary.channels.door,
  whatsapp: t.summary.channels.whatsapp,
};

export function DaySummaryScreen() {
  const router = useRouter();
  const { state, retry } = useManagementHub();

  return (
    <View style={styles.screen} testID="management-day-summary">
      <OperationsStackHeader
        title={t.summary.title}
        subtitle={t.summary.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-day-summary-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="management-day-summary-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.hub.error.title}
            description={t.hub.error.body}
            retry={{ label: t.hub.error.retry, onPress: retry }}
            testID="management-day-summary-error"
          />
        </View>
      ) : (
        <SummaryBody summary={state.hub.summary} />
      )}
    </View>
  );
}

interface SummaryBodyProps {
  summary: ManagementSummary;
}

function SummaryBody({ summary }: SummaryBodyProps) {
  return (
    <ScrollView contentContainerStyle={styles.body} testID="management-day-summary-body">
      <Text style={styles.headline}>
        {fillCopy(t.summary.headline, {
          orders: String(summary.orderCount),
          preparing: String(summary.preparingCount),
          awaiting: String(summary.pendingPayment.count),
        })}
      </Text>

      <View style={styles.block}>
        <Text style={styles.eyebrow}>{t.summary.channels.eyebrow}</Text>
        {summary.channels.map((channel) => (
          <View key={channel.source} style={styles.dashedRow} testID={`management-channel-${channel.source}`}>
            <Text style={styles.rowLabel}>{CHANNEL_LABEL[channel.source] ?? channel.source}</Text>
            <Text style={channel.cents === null ? styles.rowValueUnknown : styles.rowValue}>
              {channel.cents === null ? t.summary.channels.unknown : money(channel.cents)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.cards}>
        <View style={styles.card} testID="management-summary-door-pending">
          <Text style={styles.cardLabel}>{t.summary.doorPending.label}</Text>
          <Text style={styles.cardValue}>
            {fillCopy(t.summary.doorPending.value, {
              n: String(summary.pendingPayment.count),
              amount: money(summary.pendingPayment.cents),
            })}
          </Text>
        </View>
        <View style={styles.card} testID="management-summary-complaints">
          <Text style={styles.cardLabel}>{t.summary.openComplaints}</Text>
          <Text style={styles.cardValue}>{String(summary.openComplaintCount)}</Text>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.eyebrow}>{t.summary.tomorrow.eyebrow}</Text>
        <Text style={styles.tomorrow}>
          {fillCopy(t.summary.tomorrow.line, {
            orders: String(summary.tomorrow.orderCount),
            ready: String(summary.tomorrow.readyCount),
            amount: money(summary.tomorrow.doorPaymentCents),
          })}
        </Text>
      </View>

      <View style={styles.insights}>
        <Text style={styles.eyebrow}>{t.summary.insights.eyebrow}</Text>
        {summary.insights.length === 0 ? (
          <Text style={styles.insightEmpty} testID="management-insights-empty">
            {t.summary.insights.empty}
          </Text>
        ) : (
          summary.insights.map((insight) => (
            <View key={insight.id} style={styles.insightRow} testID={`management-insight-${insight.id}`}>
              <View style={[styles.insightDot, { backgroundColor: INSIGHT_COLOR[insight.tone] }]} />
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.stockRisk}>
        <Text style={styles.stockRiskText}>{t.summary.stockRisk}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  pending: {
    paddingTop: operationsTheme.space['8xl'],
    alignItems: 'center',
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  headline: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    lineHeight: operationsTheme.text.body * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  block: {
    gap: operationsTheme.space['2xs'],
  },
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  dashedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: operationsTheme.space.lg,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  rowLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  rowValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  /** Bilinmeyen değer SESSİZ durur: kırmızı olsaydı bir arıza gibi okunurdu, gri "veri yok" der. */
  rowValueUnknown: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.muted,
  },
  cards: {
    flexDirection: 'row',
    gap: operationsTheme.space.lg,
  },
  card: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
  },
  cardLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  cardValue: {
    // v2: `800 16px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors.ink,
  },
  tomorrow: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  insights: {
    gap: operationsTheme.space.sm,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.md,
  },
  insightDot: {
    width: operationsTheme.space.lg,
    height: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.pill,
    // Nokta ilk satırın ortasına denk gelsin (v2: `margin-top:5px`).
    marginTop: operationsTheme.space.sm,
  },
  insightText: {
    flex: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  /** Henüz gelmemiş blok, gizlenmiyor — "ısınıyor" da bir bilgidir (v2:692). */
  stockRisk: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
  },
  stockRiskText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  /** İçgörü yokken blok susmaz, yokluğunu SÖYLER. */
  insightEmpty: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
