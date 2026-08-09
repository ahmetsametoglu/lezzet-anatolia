import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { money, signedMoney } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { moneyCopy } from './copy';
import { DAY_END } from './money-fixture';

/*
  M2 · GÜN SONU ÖZETİ (v2:758-779) — salt okuma; çözüm masaüstünde.

  ── UYUŞMAZLIK GÖRÜNÜR, DÜZELTİLMEZ ─────────────────────────────────────────
  Ekranın tek vurgulu bloğu farkın kendisi: beklenen ↔ teslim edilen nakit. Eksi işareti "eksik"
  demektir ve MUTLAK DEĞERE indirgenmez (`signedMoney`) — işareti silmek, eksik parayı fazlayla
  aynı cümleye sokardı. Düzeltme kaydı burada AÇILMAZ: para bu yüzeyde izlenir, muhasebe kaydı
  masaüstünde ve kendi kurallarıyla doğar (bölüm kökünün altın kuralı).

  ── SAYILAMAYAN SAYAÇ SIFIR DEĞİLDİR ────────────────────────────────────────
  Eşleşmemiş hareket sayısı `null` gelir ve ekran bunu "sayaç yok (null ≠ 0)" diye YAZAR (v2:775
  birebir). "0" yazmak, bakılmamış bir defteri temiz göstermek olurdu (CLAUDE §1).

  ── UYUŞMAZLIK YOKSA BLOK NE OLUR ───────────────────────────────────────────
  v2 yalnız farkın OLDUĞU hâli çiziyor. Fark sıfırsa kırmızı bir kutu göstermek yanlış olurdu; blok
  aynı yerde durur ama nötr bir cümleye döner — "bugün fark yok" da gün sonunun cevabıdır ve bloğu
  tamamen kaldırmak, kullanıcıya kontrolün yapılıp yapılmadığını söylemezdi.
*/

const t = moneyCopy;

export function MoneyDayEndScreen() {
  const router = useRouter();
  const summary = DAY_END;
  const differenceCents = summary.discrepancy.deliveredCents - summary.discrepancy.expectedCents;

  return (
    <View style={styles.screen} testID="money-day-end">
      <OperationsStackHeader
        title={t.dayEnd.title}
        subtitle={t.dayEnd.caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="money-day-end-header"
      />

      <ScrollView contentContainerStyle={styles.body} testID="money-day-end-body">
        <View style={styles.block}>
          <View style={styles.dashedRow} testID="money-day-end-collected">
            <Text style={styles.rowLabel}>{t.dayEnd.collected}</Text>
            <Text style={styles.rowTotal}>{money(summary.collectedCents)}</Text>
          </View>
          <View style={styles.dashedRow} testID="money-day-end-refunds">
            <Text style={styles.rowLabel}>{t.dayEnd.refunds}</Text>
            <Text style={styles.rowRefund}>{signedMoney(summary.refundCents)}</Text>
          </View>
          <View style={styles.dashedRow} testID="money-day-end-handover">
            <Text style={styles.rowLabel}>{t.dayEnd.courierHandover}</Text>
            <Text style={styles.rowValue}>{money(summary.courierHandoverCents)}</Text>
          </View>
        </View>

        <View
          style={[styles.discrepancy, differenceCents === 0 ? styles.discrepancyCalm : styles.discrepancyOpen]}
          testID="money-day-end-discrepancy"
        >
          <Text style={differenceCents === 0 ? styles.discrepancyEyebrowCalm : styles.discrepancyEyebrow}>
            {t.dayEnd.discrepancy.eyebrow}
          </Text>
          {differenceCents === 0 ? null : (
            <Text style={styles.discrepancyValue}>{signedMoney(differenceCents)}</Text>
          )}
          <Text style={styles.discrepancyBody}>
            {differenceCents === 0
              ? t.dayEnd.discrepancy.none
              : fillCopy(t.dayEnd.discrepancy.body, {
                  expected: money(summary.discrepancy.expectedCents),
                  delivered: money(summary.discrepancy.deliveredCents),
                })}
          </Text>
        </View>

        <View style={styles.dashedRow} testID="money-day-end-unmatched">
          <Text style={styles.rowLabel}>{t.dayEnd.unmatched.label}</Text>
          <Text style={summary.unmatchedMovementCount === null ? styles.rowUnknown : styles.rowValue}>
            {summary.unmatchedMovementCount === null
              ? t.dayEnd.unmatched.unknown
              : String(summary.unmatchedMovementCount)}
          </Text>
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
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space['2xl'],
  },
  block: {
    gap: operationsTheme.space['2xs'],
  },
  dashedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
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
  rowTotal: {
    // v2: `800 15px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  rowRefund: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.error,
  },
  rowUnknown: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.muted,
  },
  discrepancy: {
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderRadius: operationsTheme.radius.card,
  },
  discrepancyOpen: {
    borderColor: operationsTheme.colors.terracotta,
  },
  discrepancyCalm: {
    borderColor: operationsTheme.colors['sand-500'],
  },
  discrepancyEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.terracotta,
  },
  discrepancyEyebrowCalm: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  discrepancyValue: {
    // v2: `800 22px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.icon,
    color: operationsTheme.colors.error,
  },
  discrepancyBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
});
