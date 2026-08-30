import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { money } from '@/lib/operations/money';
import { todayLabel } from '@/lib/operations/stamp';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsIdentity } from '@/screens/operations/sections-context';
import { operationsTheme } from '@/theme/unistyles';
import type { MoneyOverview, PendingCollection } from '@lezzet/types';
import { moneyCopy } from './copy';
import { useMoneyOverview } from './use-money.hook';

/*
  PARA KÖKÜ · TAHSİLAT İZLEME (v2:716-756) — bölümün kökü ve SALT OKUMA.

  ── HİÇBİR YAZMA AKSİYONU ÇİZİLMEZ ──────────────────────────────────────────
  Tasarımın altın kuralı ekranın son satırında yazılı: *"'bakiye düzeltme' diye bir kavram yok."*
  Para bu yüzeyde DÜZELTİLMEZ, yalnız izlenir; kayıt masaüstünde ve muhasebe kurallarıyla doğar.
  Bu yüzden ekranda tek bir düğme var ve o da gezinme: "Gün sonu →".

  ── ZİL YOK, METİN EYLEMİ VAR ───────────────────────────────────────────────
  Başlığın sağ yuvası bu bölümde bildirim düğmesi DEĞİL (v2:719) — karar `section-header.tsx`
  künyesinde ve kabuk testinde ölçülü.

  ── ARTIK GERÇEK UÇTAN (21.12) ──────────────────────────────────────────────
  `/money/overview` okunur; 21.8'in açık bıraktığı "para kökünün boş/hata durumu" burada TAM
  kapandı: boş liste de, yüklenememe de gerçek hâller ve ikisi de çizili. Bekleyen küme GÜNÜN
  ödenmemiş siparişleridir (sözleşme künyesi) — tüm zamanların dökümü masaüstü muhasebenin işi.

  ── HESAP SATIRLARI ADIYLA ──────────────────────────────────────────────────
  v2 iki sabit satır çiziyordu (Kasa · Banka); defterde hesap SAYISI işletme kurulumudur (Kasa,
  Revolut, Crédit Mutuel, Stripe…). Satır adı SUNUCUDAN gelir — iki ada indirmek, iki hesabı tek
  satırda toplamak ya da birini gizlemek olurdu.
*/

const t = moneyCopy;
const shell = operationsCopy;

export function MoneyTrackingScreen() {
  const router = useRouter();
  const { state, retry } = useMoneyOverview();
  const identity = useOperationsIdentity();

  return (
    <View style={styles.screen} testID="operations-section-money">
      <OperationsSectionHeader
        section="money"
        eyebrow={shell.sections.money.eyebrow}
        title={shell.sections.money.title}
        /* KİM VE HANGİ GÜN (v3:23) — para ekranı bir günün fotoğrafıdır; hangi güne baktığı
           yazılmazsa "bugün gerçekleşen" cümlesi hangi günü anlattığını söylemez. Deponun ADI
           tasarımda var ama mobile hiç ulaşmıyor (uyuşmazlık 1) — uydurulmuyor. */
        context={`${identity.name} · ${todayLabel()}`}
        right={
          <PressableSurface
            onPress={() => router.navigate('/day-end')}
            feedback="opacity"
            compact
            style={styles.dayEndAction}
            accessibilityLabel={t.track.dayEnd}
            testID="money-day-end-link"
          >
            <Text style={styles.dayEndLabel}>{t.track.dayEnd}</Text>
          </PressableSurface>
        }
        identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      />

      {state.status === 'loading' ? (
        <View style={styles.pending} testID="money-tracking-loading">
          <ActivityIndicator color={operationsTheme.colors.olive} />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.common.error.title}
            description={t.common.error.body}
            retry={{ label: t.common.error.retry, onPress: retry }}
            testID="money-tracking-error"
          />
        </View>
      ) : (
        <OverviewBody overview={state.data} />
      )}
    </View>
  );
}

interface OverviewBodyProps {
  overview: MoneyOverview;
}

function OverviewBody({ overview }: OverviewBodyProps) {
  const floatValue =
    overview.courierFloat.chequeCents > 0
      ? fillCopy(t.track.float.valueWithCheque, {
          cash: money(overview.courierFloat.cashCents),
          card: money(overview.courierFloat.cardCents),
          cheque: money(overview.courierFloat.chequeCents),
        })
      : fillCopy(t.track.float.value, {
          cash: money(overview.courierFloat.cashCents),
          card: money(overview.courierFloat.cardCents),
        });

  return (
    <ScrollView contentContainerStyle={styles.body} testID="money-tracking-body">
      {/* GÜNÜN PARASI EN ÜSTTE (v3:23) — muhasebenin ilk sorusu "bugün ne girdi". Toplam
          kırılımdan TÜRETİLİR: ayrı bir toplam alanı, bir gün kırılımla ayrışabilecek ikinci bir
          gerçek olurdu. */}
      <View style={styles.todayCard} testID="money-today-card">
        <Text style={styles.eyebrow}>{t.track.today.eyebrow}</Text>
        {overview.todayByMethod.length === 0 ? (
          <Text style={styles.emptyLine} testID="money-today-empty">
            {t.track.today.empty}
          </Text>
        ) : (
          <>
            <Text style={styles.todayTotal} testID="money-today-total">
              {money(overview.todayByMethod.reduce((sum, row) => sum + row.cents, 0))}
            </Text>
            <View style={styles.todayCells}>
              {overview.todayByMethod.map((row) => (
                <View key={row.method} style={styles.todayCell} testID={`money-today-${row.method}`}>
                  <Text style={styles.todayCellValue}>{money(row.cents)}</Text>
                  <Text style={styles.todayCellLabel}>{t.common.method[row.method]}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.block}>
        <Text style={styles.eyebrow}>{t.track.pending.eyebrow}</Text>
        {overview.pending.length === 0 ? (
          <Text style={styles.emptyLine} testID="money-pending-empty">
            {t.track.pending.empty}
          </Text>
        ) : (
          overview.pending.map((item) => (
            <View key={item.orderId} style={styles.dashedRow} testID={`money-pending-${item.orderId}`}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.referenceNo ?? t.track.pending.noRef}</Text>
                <Text style={styles.rowMeta}>
                  {item.customerName} · {t.track.pending.state[item.status]}
                </Text>
              </View>
              {/* TUTAR BÜYÜK, ETİKET ALTINDA (v3:23): satırın cevabı tutardır; "kapıda mı, kalan
                  mı" ve yöntem onun künyesi — tek cümleye dizildiğinde tutar cümlenin içinde
                  kayboluyordu. */}
              <View style={styles.pendingRight}>
                <Text style={styles.pendingAmount}>{money(item.remainingCents)}</Text>
                <Text style={styles.pendingTag}>{pendingTag(item)}</Text>
              </View>
            </View>
          ))
        )}
        <Text style={styles.note}>{t.track.pending.note}</Text>
      </View>

      <View style={styles.floatCard} testID="money-courier-float">
        <Text style={styles.eyebrow}>{t.track.float.eyebrow}</Text>
        <Text style={styles.floatValue}>{floatValue}</Text>
        <Text style={styles.note}>{t.track.float.note}</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.eyebrow}>{t.track.balances.eyebrow}</Text>
        {overview.accounts.map((account, index) => (
          <View
            key={`${account.type}-${account.name}`}
            /* Son satırın altında ayraç YOK (v2:750): blok orada bitiyor ve altındaki not
               satırın devamı gibi okunmamalı. */
            style={index === overview.accounts.length - 1 ? styles.plainRow : styles.dashedRow}
            testID={`money-balance-${index}`}
          >
            <Text style={styles.rowLabel}>{account.name}</Text>
            <Text style={styles.rowValue}>{money(account.cents)}</Text>
          </View>
        ))}
        <Text style={styles.note}>{t.track.balances.note}</Text>
      </View>

      {/* KAPANIŞ CÜMLESİ (v3:23) — bu ekranın ne OLMADIĞINI söylüyor: hiçbir şey yazmaz, kasa
          kapatmaz. Tasarımın altın kuralının ekrandaki karşılığı. */}
      <Text style={styles.footnote} testID="money-tracking-footnote">
        {t.track.footnote}
      </Text>
    </ScrollView>
  );
}

/**
 * Bekleyen satırın ETİKETİ (v3:23) — "KAPIDA · KART". Yöntem biliniyorsa eklenir, bilinmiyorsa
 * (henüz seçilmemiş kapıda ödeme) etiket yöntemsiz kalır — uydurulmaz.
 *
 * v2'de bu bir CÜMLEYDİ ("Kapıda 60,00 € · kart") ve tutarı içine alıyordu; tutar artık ayrı ve
 * büyük yazılıyor, etiket yalnız onun künyesi.
 */
function pendingTag(item: PendingCollection): string {
  const kind = item.kind === 'door' ? t.track.pending.doorTag : t.track.pending.partialTag;
  return item.method === null
    ? kind
    : fillCopy(t.track.pending.tagWithMethod, { kind, method: t.common.method[item.method] });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  dayEndAction: {
    // v2:723 — metin eylemi başlığın ilk satırıyla hizalansın diye biraz aşağıda durur.
    paddingTop: operationsTheme.space.md,
  },
  dayEndLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.olive,
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
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
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
  plainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.lg,
  },
  rowText: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** Bekleyen para TERRACOTTA: henüz kasada değil — "geldi" ile karışmasın (v2:733). */
  pendingSentence: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.terracotta,
    textAlign: 'right',
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
  emptyLine: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['field-label'],
    lineHeight: operationsTheme.text['field-label'] * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.lg,
  },
  todayCard: {
    gap: operationsTheme.space.xs,
    padding: operationsTheme.space['3xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    backgroundColor: operationsTheme.colors.panel,
  },
  todayTotal: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['page-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors.ink,
  },
  todayCells: {
    flexDirection: 'row',
    marginTop: operationsTheme.space.lg,
    gap: operationsTheme.space.lg,
  },
  todayCell: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.xl,
    alignItems: 'center',
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['neutral-bg'],
  },
  todayCellValue: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  todayCellLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  pendingRight: { alignItems: 'flex-end', gap: operationsTheme.space['2xs'] },
  pendingAmount: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  pendingTag: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['badge-sm'],
    color: operationsTheme.colors.muted,
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  floatCard: {
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.card,
  },
  floatValue: {
    // v2: `800 20px` — Karla'nın 800'ü yüklenmiyor; en yakın gerçek kesit 700 (`fonts.ts`).
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors.ink,
  },
  note: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.xs,
  },
});
