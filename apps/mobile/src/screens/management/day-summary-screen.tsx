import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { money } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { managementCopy } from './copy';
import { DAY_SUMMARY, type InsightTone } from './management-fixture';

/*
  Y5 · GÜN ÖZETİ (v2:664-696) — yönetimin TEK salt-okunur ekranı: günün fotoğrafı.

  Hiçbir eylem YOK ve bu tasarımın kararı ("salt okuma · günün fotoğrafı"). Ekran bir karar
  vermiyor, kararların ZEMİNİNİ gösteriyor; bir düğme eklemek burada olmayan bir yetki vaat ederdi.

  ── ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİLDİR ────────────────────────────────────────
  WhatsApp kanalının cirosu `null` gelir ve ekran onu "— bilinmiyor (sıfır değil)" diye yazar
  (v2:673 birebir). "0,00 €" yazmak, ölçülemeyen bir kanalı "hiç satış olmadı" diye okuturdu
  (CLAUDE §1). Aynı disiplin M2'nin eşleşmemiş hareket sayacında da sürüyor.

  ── VERİ FIXTURE, EKRAN TAM ────────────────────────────────────────────────
  Gün özetini birleştiren uç bu etapta yazılmıyor (UI-only); gerekçe ve akıbet
  `management-fixture.ts` künyesinde. Ekranın kendisi tam: kanal kırılımı, iki karo, yarının
  sevkiyatı, üç içgörü ve stok riski notu tasarımdaki sırasıyla duruyor.
*/

const t = managementCopy;

/** İçgörünün noktası — iyi (zeytin) · izle (terracotta) · kötü (kırmızı); v2:686-688. */
const INSIGHT_COLOR = {
  good: operationsTheme.colors.olive,
  watch: operationsTheme.colors.terracotta,
  bad: operationsTheme.colors.error,
} as const satisfies Record<InsightTone, string>;

export function DaySummaryScreen() {
  const router = useRouter();
  const summary = DAY_SUMMARY;

  return (
    <View style={styles.screen} testID="management-day-summary">
      <OperationsStackHeader
        title={t.summary.title}
        subtitle={t.summary.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-day-summary-header"
      />

      <ScrollView contentContainerStyle={styles.body} testID="management-day-summary-body">
        <Text style={styles.headline}>
          {fillCopy(t.summary.headline, {
            orders: String(summary.orderCount),
            preparing: String(summary.preparingCount),
            awaiting: String(summary.awaitingCollectionCount),
          })}
        </Text>

        <View style={styles.block}>
          <Text style={styles.eyebrow}>{t.summary.channels.eyebrow}</Text>
          {summary.channels.map((channel) => (
            <View key={channel.key} style={styles.dashedRow} testID={`management-channel-${channel.key}`}>
              <Text style={styles.rowLabel}>{t.summary.channels[channel.key]}</Text>
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
                n: String(summary.doorPending.count),
                amount: money(summary.doorPending.cents),
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
          {/* Tek cümlenin ORTASI vurgulu (v2:682): rotaya atanmamış sipariş sayısı yarının tek
              gerçek riski. İç içe `Text` RN'de satır akışını bozmaz — ayrı bir satıra almak cümleyi
              ikiye bölerdi. */}
          <Text style={styles.tomorrow}>
            {fillCopy(t.summary.tomorrow.head, {
              orders: String(summary.tomorrow.orderCount),
              ready: String(summary.tomorrow.readyCount),
            })}
            <Text style={styles.tomorrowAlert}>
              {fillCopy(t.summary.tomorrow.unassigned, { n: String(summary.tomorrow.unassignedCount) })}
            </Text>
            {fillCopy(t.summary.tomorrow.tail, { amount: money(summary.tomorrow.doorPaymentCents) })}
          </Text>
        </View>

        <View style={styles.insights}>
          <Text style={styles.eyebrow}>{t.summary.insights.eyebrow}</Text>
          {summary.insights.map((insight) => (
            <View key={insight.id} style={styles.insightRow} testID={`management-insight-${insight.id}`}>
              <View style={[styles.insightDot, { backgroundColor: INSIGHT_COLOR[insight.tone] }]} />
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))}
        </View>

        <View style={styles.stockRisk}>
          <Text style={styles.stockRiskText}>{t.summary.stockRisk}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
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
  tomorrowAlert: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    color: operationsTheme.colors.terracotta,
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
});
