import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { money, signedMoney } from '@/lib/operations/money';
import { dateLabelOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import type { MoneyDayEnd } from '@lezzet/types';
import { moneyCopy } from './copy';
import { useMoneyDayEnd } from './use-money.hook';

/*
  M2 · GÜN SONU ÖZETİ (v2:758-779) — salt okuma; çözüm masaüstünde.

  ── UYUŞMAZLIK GÖRÜNÜR, DÜZELTİLMEZ ─────────────────────────────────────────
  Ekranın tek vurgulu bloğu farkın kendisi: beklenen ↔ sayılan nakit. Eksi işareti "eksik"
  demektir ve MUTLAK DEĞERE indirgenmez (`signedMoney`) — işareti silmek, eksik parayı fazlayla
  aynı cümleye sokardı. Düzeltme kaydı burada AÇILMAZ: para bu yüzeyde izlenir, muhasebe kaydı
  masaüstünde ve kendi kurallarıyla doğar (bölüm kökünün altın kuralı).

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  `/money/day-end` okunur. Mutabakat üç hâlli ve üçü de çizili:
  · fark VAR   → terracotta çerçeve + işaretli tutar (kapanan seferlerin beklenen−sayılan'ı)
  · fark YOK   → nötr çerçeve, "tutuyor" cümlesi
  · sefer YOK  → `discrepancy: null` — soru henüz sorulmadı; 0 yazmak "fark yok" YALANI olurdu
                 (fixture döneminin "sayaç yok (null ≠ 0)" disiplini, artık gerçek veride).
*/

const t = moneyCopy;

export function MoneyDayEndScreen() {
  const router = useRouter();
  const { state, retry } = useMoneyDayEnd();

  return (
    <View style={styles.screen} testID="money-day-end">
      <OperationsStackHeader
        title={t.dayEnd.title}
        /* HANGİ GÜNÜN ÖZETİ (v3:24) — "salt okuma" tek başına hangi günü anlattığını söylemiyordu;
           gün sunucudan geliyor (`summary.date`), cihazın takviminden tahmin edilmiyor. */
        subtitle={captionOf(state)}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="money-day-end-header"
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="money-day-end-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: retry }}
            testID="money-day-end-error"
          />
        </View>
      ) : (
        <DayEndBody summary={state.data} />
      )}
    </View>
  );
}

/**
 * Başlık altı — gün ADIYLA. Özet daha yüklenmediyse ya da düştüyse gün BİLİNMEZ ve kuyruksuz
 * yazılır: cihazın bugününü yazmak, sunucunun başka bir günü özetlediği hâlde doğru görünürdü.
 */
function captionOf(state: { status: string; data?: MoneyDayEnd }): string {
  const label = state.data === undefined ? null : dateLabelOf(state.data.date);
  return label === null ? t.dayEnd.captionNoDate : fillCopy(t.dayEnd.caption, { date: label });
}

interface DayEndBodyProps {
  summary: MoneyDayEnd;
}

function DayEndBody({ summary }: DayEndBodyProps) {
  const discrepancy = summary.discrepancy;
  const differenceCents = discrepancy === null ? null : discrepancy.countedCents - discrepancy.expectedCents;
  const calm = differenceCents === null || differenceCents === 0;

  return (
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

      <View style={[styles.discrepancy, calm ? styles.discrepancyCalm : styles.discrepancyOpen]} testID="money-day-end-discrepancy">
        <Text style={calm ? styles.discrepancyEyebrowCalm : styles.discrepancyEyebrow}>
          {t.dayEnd.discrepancy.eyebrow}
        </Text>
        {differenceCents === null || differenceCents === 0 ? null : (
          <>
            {/* CÜMLE ÖNCE, SAYI SONRA (v3:24): "−4,50 €" tek başına ne olduğunu söylemiyor —
                eksi işareti eksik parayı mı fazlayı mı gösteriyor, hangi adımda doğdu? Başlık
                ikisini de söylüyor, sayı onun altında duruyor. */}
            <Text style={styles.discrepancyHeadline}>
              {fillCopy(t.dayEnd.discrepancy.headline, {
                amount: money(Math.abs(differenceCents)),
                direction: differenceCents < 0 ? t.dayEnd.discrepancy.short : t.dayEnd.discrepancy.over,
              })}
            </Text>
            <Text style={styles.discrepancyValue}>{signedMoney(differenceCents)}</Text>
          </>
        )}
        <Text style={styles.discrepancyBody}>
          {discrepancy === null
            ? t.dayEnd.discrepancy.noRun
            : differenceCents === 0
              ? t.dayEnd.discrepancy.none
              : fillCopy(t.dayEnd.discrepancy.body, {
                  expected: money(discrepancy.expectedCents),
                  delivered: money(discrepancy.countedCents),
                })}
        </Text>
        {/* ÇÖZÜM NEREDE (v3:24) — ekran düzeltmiyor; nerede düzeltildiğini söylemezse muhasebeci
            burada bir düğme arar. */}
        {calm ? null : <Text style={styles.discrepancyBody}>{t.dayEnd.discrepancy.resolution}</Text>}
      </View>

      <View style={styles.dashedRow} testID="money-day-end-unmatched">
        {/* SAYININ NE OLDUĞU ALTINDA (v3:24): "Eşleşmemiş hareket · 3" tek başına neyle
            eşleşmediğini söylemiyordu — banka ekstresi. */}
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{t.dayEnd.unmatched.label}</Text>
          <Text style={styles.rowHint}>{t.dayEnd.unmatched.hint}</Text>
        </View>
        <Text style={styles.rowValue}>{String(summary.unmatchedMovementCount)}</Text>
      </View>

      {/* KAPANIŞ CÜMLESİ (v3:24) — bu ekranın ne OLMADIĞI: kasa kapatmaz, sonucu gösterir. */}
      <Text style={styles.footnote} testID="money-day-end-footnote">
        {t.dayEnd.footnote}
      </Text>
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
  discrepancyHeadline: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.terracotta,
  },
  rowText: { flex: 1, gap: operationsTheme.space['2xs'] },
  rowHint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
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
